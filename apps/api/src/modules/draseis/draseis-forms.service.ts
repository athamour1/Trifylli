import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DrasiFormStatus, DrasiFormType, MemberKind, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import {
  DRASI_FORM_FIELDS,
  FORM_LINK_TTL_DAYS,
  HEALTH_DATA_RETENTION_DAYS,
  KLADOS_LABEL,
  collabDocument,
  drasiCanReadHealth,
  formFieldApplies,
  type DrasiFormField,
  type DrasiFormsMatrix,
  type DrasiFormView,
  type HealthSummaryEntry,
  type IssuedFormLink,
  type KladosType,
  type LinkEmailResult,
  type PublicFormView,
} from '@trifylli/shared';
import { AuditService } from '../../common/audit/audit.service';
import { CollabService } from '../collab/collab.service';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { JobMonitor } from '../../common/jobs/job-monitor';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { RequestUser } from '../../common/auth/types';
import { ageInYears } from '../meloi/age';
import { sniffMime } from '../files/sniff';
import { EseoClient } from '../integrations/eseo.client';
import { DrasiAccessService } from './drasi-access.service';
import type { EmailLinksDto, IssueFormsDto, SubmitFormDto } from './dto/drasi-forms.dto';
import { linkRecipients } from './link-emails';
import { LinkMailer, type MailableLink } from './link-mailer';
import { mergePdfs, renderFilledForm, type FilledFormInput, type FormTemplate } from './forms-pdf';

const MAX_SIGNATURE_BYTES = 250 * 1024;

/**
 * Έντυπα δράσης: δήλωση συμμετοχής (ανήλικοι) και κατάσταση υγείας (όλοι).
 * Βλ. docs/draseis.md F5.
 *
 * Ο σύνδεσμος προς τον γονέα **δεν είναι δημόσιο έγγραφο**: ένα token ανά
 * έντυπο ανά παιδί, στη βάση μόνο το hash του, μόνο γραφή, λήγει με την υποβολή
 * ή σε `FORM_LINK_TTL_DAYS`. Κάθε άνοιγμα και υποβολή γράφεται στο audit. Τα
 * ιατρικά σβήνονται `HEALTH_DATA_RETENTION_DAYS` μετά τη λήξη της δράσης.
 */
@Injectable()
export class DraseisFormsService {
  private readonly logger = new Logger(DraseisFormsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly eseo: EseoClient,
    @Inject(AppConfigToken) private readonly config: AppConfig,
    private readonly jobs: JobMonitor,
    private readonly linkMailer: LinkMailer,
    private readonly collab: CollabService,
  ) {}

  // ───────────────────────── Για τα στελέχη ─────────────────────────

  /** Ο πίνακας παιδιών × εντύπων — το «4 από 41 εκκρεμούν» του αρχηγού. */
  async matrix(user: RequestUser, id: string): Promise<DrasiFormsMatrix> {
    const drasi = await this.access.load(user, id, 'read');
    const participants = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, kind: true, birthDate: true, phone: true } },
        forms: { orderBy: { type: 'asc' } },
      },
      orderBy: [{ kind: 'desc' }, { user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });

    let pending = 0;
    let total = 0;
    const rows = participants.map((p) => {
      const isMinor = minorAt(p.user.birthDate, drasi.dateStart, p.kind);
      const needed = requiredTypes(isMinor);
      const forms = needed.map((type): DrasiFormView => {
        const existing = p.forms.find((f) => f.type === type);
        total += 1;
        if (!existing || existing.status !== DrasiFormStatus.SUBMITTED) pending += 1;
        return existing
          ? toView(existing)
          : {
              id: '',
              participantId: p.id,
              type,
              status: DrasiFormStatus.PENDING,
              sentAt: null,
              expiresAt: null,
              submittedAt: null,
              signerName: null,
              signerRole: null,
              hasData: false,
              purgedAt: null,
            };
      });
      return {
        participantId: p.id,
        user: { ...p.user, birthDate: p.user.birthDate?.toISOString() ?? null },
        isMinor,
        forms,
      };
    });

    return { participants: rows, pending, total, emailEnabled: this.linkMailer.enabled };
  }

  /**
   * Εκδίδει συνδέσμους. Το token επιστρέφεται **μία φορά** — μετά υπάρχει μόνο
   * το hash. Όσα είναι ήδη συμπληρωμένα δεν ξαναεκδίδονται.
   */
  async issue(user: RequestUser, id: string, dto: IssueFormsDto): Promise<IssuedFormLink[]> {
    const drasi = await this.access.load(user, id, 'write');
    const participants = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id, ...(dto.participantIds?.length ? { id: { in: dto.participantIds } } : {}) },
      include: { user: { select: { birthDate: true, email: true, guardians: { select: { email: true } } } }, forms: true },
    });

    const expiresAt = new Date(Date.now() + FORM_LINK_TTL_DAYS * 86_400_000);
    const purgeAfter = new Date(drasi.dateEnd.getTime() + HEALTH_DATA_RETENTION_DAYS * 86_400_000);
    const links: IssuedFormLink[] = [];

    for (const p of participants) {
      const isMinor = minorAt(p.user.birthDate, drasi.dateStart, p.kind);
      const emailTo = linkRecipients(p.user, isMinor);
      const types = requiredTypes(isMinor).filter((t) => !dto.types?.length || dto.types.includes(t));
      for (const type of types) {
        const existing = p.forms.find((f) => f.type === type);
        if (existing?.status === DrasiFormStatus.SUBMITTED) continue;
        if (existing && existing.status === DrasiFormStatus.SENT && !dto.reissue) continue;

        const token = randomBytes(32).toString('base64url');
        const form = await this.prisma.drasiForm.upsert({
          where: { participantId_type: { participantId: p.id, type } },
          create: {
            drasiId: id,
            participantId: p.id,
            type,
            status: DrasiFormStatus.SENT,
            tokenHash: hashToken(token),
            expiresAt,
            sentAt: new Date(),
            purgeAfter: type === DrasiFormType.YGEIA ? purgeAfter : null,
          },
          update: {
            status: DrasiFormStatus.SENT,
            tokenHash: hashToken(token),
            expiresAt,
            sentAt: new Date(),
            openedAt: null,
          },
        });
        links.push({ participantId: p.id, formId: form.id, type, url: `${this.appUrl()}/forms/${token}`, expiresAt: expiresAt.toISOString(), emailTo });
      }
    }

    await this.audit.record(user, 'drasi.forms.issue', 'drasi', id, { count: links.length, reissue: dto.reissue ?? false });
    return links;
  }

  /**
   * Αποστολή με email συνδέσμων που μόλις εκδόθηκαν. Το token το έχει μόνο η
   * σελίδα που τους έβγαλε (στη βάση μένει το hash): έρχεται από εκεί και
   * ελέγχεται με το hash του εντύπου. Οι παραλήπτες βγαίνουν εδώ — όποιος
   * υπογράφει — ώστε το endpoint να μη στέλνει ό,τι θέλει σε όποιον θέλει.
   */
  async emailLinks(user: RequestUser, id: string, dto: EmailLinksDto): Promise<LinkEmailResult[]> {
    await this.access.load(user, id, 'write');
    if (!this.linkMailer.enabled) throw new ServiceUnavailableException('Η αποστολή email δεν έχει ρυθμιστεί στον server (SMTP).');
    const forms = await this.prisma.drasiForm.findMany({
      where: { drasiId: id, id: { in: dto.links.map((l) => l.id) } },
      include: {
        drasi: { select: { dateStart: true } },
        participant: {
          select: {
            kind: true,
            user: { select: { firstName: true, lastName: true, email: true, birthDate: true, guardians: { select: { email: true } } } },
          },
        },
      },
    });
    const byId = new Map(forms.map((f) => [f.id, f]));
    const now = new Date();
    const refused: LinkEmailResult[] = [];
    const mailable: MailableLink[] = [];
    for (const link of dto.links) {
      const form = byId.get(link.id);
      const live =
        !!form &&
        form.tokenHash === hashToken(link.token) &&
        (form.status === DrasiFormStatus.SENT || form.status === DrasiFormStatus.OPENED) &&
        !!form.expiresAt &&
        form.expiresAt > now;
      if (!form || !live) {
        refused.push({ id: link.id, sent: false, to: [], error: 'Ο σύνδεσμος δεν ισχύει πια — βγάλε νέο.' });
        continue;
      }
      const u = form.participant.user;
      const isMinor = minorAt(u.birthDate, form.drasi.dateStart, form.participant.kind);
      mailable.push({
        id: form.id,
        kind: form.type,
        participant: `${u.lastName} ${u.firstName}`.trim(),
        to: linkRecipients(u, isMinor),
        url: `${this.appUrl()}/forms/${link.token}`,
        expiresAt: form.expiresAt!,
      });
    }

    const results = mailable.length ? await this.linkMailer.send(user, id, mailable) : [];
    const sent = results.filter((r) => r.sent);
    for (const r of sent) await this.prisma.drasiForm.update({ where: { id: r.id }, data: { sentTo: r.to.join(', ') } });
    await this.audit.record(user, 'drasi.forms.email', 'drasi', id, { sent: sent.length, failed: results.length - sent.length + refused.length });
    const byLink = new Map([...refused, ...results].map((r) => [r.id, r]));
    return dto.links.map((l) => byLink.get(l.id)!);
  }

  /** Ακύρωση: ο σύνδεσμος πεθαίνει· οι απαντήσεις (αν υπήρχαν) μένουν ως ιστορικό μέχρι τον καθαρισμό. */
  async void(user: RequestUser, id: string, formId: string) {
    await this.access.load(user, id, 'write');
    const form = await this.prisma.drasiForm.findFirst({ where: { id: formId, drasiId: id } });
    if (!form) throw new NotFoundException('Το έντυπο δεν βρέθηκε.');
    await this.prisma.drasiForm.update({ where: { id: formId }, data: { status: DrasiFormStatus.VOID, tokenHash: null } });
    await this.audit.record(user, 'drasi.form.void', 'drasi_form', formId, { drasiId: id });
    return { voided: true };
  }

  /** Οι απαντήσεις ενός εντύπου — κάθε ανάγνωση ιατρικών αφήνει ίχνος. */
  async view(user: RequestUser, id: string, formId: string) {
    await this.access.load(user, id, 'read');
    const form = await this.prisma.drasiForm.findFirst({
      where: { id: formId, drasiId: id },
      include: { participant: { include: { user: { select: { firstName: true, lastName: true } } } }, signatureFile: true },
    });
    if (!form) throw new NotFoundException('Το έντυπο δεν βρέθηκε.');
    if (form.type === DrasiFormType.YGEIA) {
      await this.assertHealthReader(user, id);
      await this.audit.record(user, 'drasi.health.read', 'drasi_form', formId, { drasiId: id });
    }
    return {
      ...toView(form),
      participant: form.participant.user,
      data: (form.data as Record<string, unknown> | null) ?? null,
      submittedIp: form.submittedIp,
      signatureFileId: form.signatureFileId,
      fields: DRASI_FORM_FIELDS[form.type],
    };
  }

  /**
   * Η σύνοψη υγείας: ένα χαρτί για την τσάντα πρώτων βοηθειών. Μόνο όσοι έχουν
   * συμπληρωμένο έντυπο — η απουσία είναι η ίδια πληροφορία («δεν ξέρουμε»).
   */
  async healthSummary(user: RequestUser, id: string): Promise<HealthSummaryEntry[]> {
    await this.access.load(user, id, 'read');
    const forms = await this.prisma.drasiForm.findMany({
      where: { drasiId: id, type: DrasiFormType.YGEIA, status: DrasiFormStatus.SUBMITTED, data: { not: Prisma.DbNull } },
      include: {
        participant: {
          include: {
            user: {
              select: { firstName: true, lastName: true, birthDate: true, memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } } },
            },
            groups: { include: { group: { select: { kind: true, name: true } } } },
          },
        },
      },
      orderBy: { participant: { user: { lastName: 'asc' } } },
    });
    await this.audit.record(user, 'drasi.health.read', 'drasi', id, { count: forms.length });

    const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    // «Ναι + αναλυτικά» → το κείμενο· «Όχι» → «όχι»· αναπάντητο → κενό.
    const yesDetails = (d: Record<string, unknown>, key: string): string => (d[key] === true ? text(d[`${key}Details`]) || 'ναι' : d[key] === false ? 'όχι' : '');
    return forms.map((f) => {
      const d = (f.data as Record<string, unknown> | null) ?? {};
      const flags = (['epilepsy', 'panic', 'claustrophobia', 'nosebleeds', 'sleepwalking', 'enuresis', 'lice', 'enzymes'] as const)
        .filter((k) => d[k] === true)
        .map((k) => FLAG_LABEL[k]);
      return {
        participantId: f.participantId,
        user: {
          firstName: f.participant.user.firstName,
          lastName: f.participant.user.lastName,
          birthDate: f.participant.user.birthDate?.toISOString() ?? null,
          kladosType: (f.participant.user.memberships[0]?.klados.type as KladosType | undefined) ?? null,
        },
        skini: f.participant.groups.find((g) => g.group.kind === 'SKINI')?.group.name ?? null,
        group: f.participant.groups.find((g) => g.group.kind !== 'SKINI')?.group.name ?? null,
        allergies: yesDetails(d, 'allergies'),
        medications: yesDetails(d, 'medications'),
        conditions: [yesDetails(d, 'conditions'), ...flags].filter((x) => x && x !== 'όχι').join(' · ') || yesDetails(d, 'conditions'),
        diet: yesDetails(d, 'diet'),
        bloodType: text(d.bloodType) === 'Δεν γνωρίζω' ? '' : text(d.bloodType),
        emergencyPhone: [text(d.emergency1Phone1), text(d.emergency1Name)].filter(Boolean).join(' '),
        notes: [yesDetails(d, 'extraInfo'), text(d.addendum)].filter((x) => x && x !== 'όχι').join(' · '),
        submittedAt: f.submittedAt?.toISOString() ?? '',
      };
    });
  }

  /**
   * Τα ιατρικά τα διαβάζει μόνο όποιος βλέπει το Φαρμακείο (F6). Τα Έντυπα τα
   * βλέπει κάθε στέλεχος — αλλά μόνο την κατάσταση των εντύπων υγείας.
   */
  private async assertHealthReader(user: RequestUser, id: string): Promise<void> {
    const access = user.drasiGrant?.drasiId === id ? user.drasiGrant.access : await this.access.accessFor(user, id);
    if (!drasiCanReadHealth(access)) {
      throw new ForbiddenException('Τα στοιχεία υγείας τα βλέπουν μόνο ο αρχηγός, το Τοπικό και το φαρμακείο της δράσης.');
    }
  }

  // ───────────────────────── Λήψη: τα επίσημα έντυπα συμπληρωμένα ─────────────────────────

  /** Ένα έντυπο ως το πρωτότυπο PDF του Σ.Ε.Ο. συμπληρωμένο, με την υπογραφή στη θέση της. */
  async pdf(user: RequestUser, id: string, formId: string): Promise<{ filename: string; buffer: Buffer }> {
    const drasi = await this.access.load(user, id, 'read');
    const form = await this.prisma.drasiForm.findFirst({ where: { id: formId, drasiId: id }, include: formPdfInclude });
    if (!form) throw new NotFoundException('Το έντυπο δεν βρέθηκε.');
    if (form.type === DrasiFormType.YGEIA) await this.assertHealthReader(user, id);
    if (form.status !== DrasiFormStatus.SUBMITTED || !form.data) throw new BadRequestException('Το έντυπο δεν έχει συμπληρωθεί.');
    if (form.type === DrasiFormType.YGEIA) await this.audit.record(user, 'drasi.health.read', 'drasi_form', formId, { drasiId: id, pdf: true });
    const ctx = await this.pdfContext(drasi.id);
    const bytes = await this.renderOne(form, ctx);
    const kind = form.type === DrasiFormType.SYMMETOXI ? 'Δήλωση Συμμετοχής' : 'Πιστοποιητικό Υγείας';
    return { filename: `${kind} - ${form.participant.user.lastName} ${form.participant.user.firstName}.pdf`, buffer: Buffer.from(bytes) };
  }

  /** Όλα τα συμπληρωμένα έντυπα ενός είδους σε ένα PDF — για εκτύπωση/αρχείο της δράσης. */
  async pdfAll(user: RequestUser, id: string, type: DrasiFormType): Promise<{ filename: string; buffer: Buffer }> {
    const drasi = await this.access.load(user, id, 'read');
    if (type === DrasiFormType.YGEIA) await this.assertHealthReader(user, id);
    const forms = await this.prisma.drasiForm.findMany({
      where: { drasiId: id, type, status: DrasiFormStatus.SUBMITTED, data: { not: Prisma.DbNull } },
      include: formPdfInclude,
      orderBy: [{ participant: { user: { lastName: 'asc' } } }, { participant: { user: { firstName: 'asc' } } }],
    });
    if (!forms.length) throw new NotFoundException('Δεν υπάρχει συμπληρωμένο έντυπο αυτού του είδους.');
    if (type === DrasiFormType.YGEIA) await this.audit.record(user, 'drasi.health.read', 'drasi', id, { count: forms.length, pdf: true });
    const ctx = await this.pdfContext(drasi.id);
    const parts: Uint8Array[] = [];
    for (const f of forms) parts.push(await this.renderOne(f, ctx));
    const kind = type === DrasiFormType.SYMMETOXI ? 'Δηλώσεις Συμμετοχής' : 'Πιστοποιητικά Υγείας';
    return { filename: `${kind} - ${drasi.title}.pdf`, buffer: Buffer.from(await mergePdfs(parts)) };
  }

  /** Ό,τι είναι κοινό για όλα τα έντυπα μιας δράσης (Μέρος 1). */
  private async pdfContext(id: string): Promise<FilledFormInput['drasi']> {
    const d = await this.prisma.drasi.findUniqueOrThrow({
      where: { id },
      include: {
        topiko: { select: { name: true, eseoCode: true } },
        klados: { select: { type: true } },
        roles: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    // Υπεύθυνος Α' Βοηθειών: όποιος έχει το Φαρμακείο, αλλιώς ο Αρχηγός.
    const firstAid = d.roles.find((r) => r.kind === 'FARMAKEIO') ?? d.roles.find((r) => r.kind === 'ARXIGOS');
    // Η Περιφέρεια δεν τηρείται τοπικά· το e-SEO τη δίνει ως γονέα του Τοπικού (best effort).
    let region: string | null = null;
    if (d.topiko.eseoCode) {
      try {
        region = (await this.eseo.unit(d.topiko.eseoCode))?.parentName ?? null;
      } catch {
        region = null;
      }
    }
    return {
      title: d.title,
      location: d.location,
      dateStart: d.dateStart,
      dateEnd: d.dateEnd,
      topiko: d.topiko.name,
      region,
      firstAid: firstAid ? `${firstAid.user.firstName} ${firstAid.user.lastName}` : null,
      kladosLabel: d.klados ? KLADOS_LABEL[d.klados.type as KladosType] : null,
    };
  }

  private async renderOne(form: Prisma.DrasiFormGetPayload<{ include: typeof formPdfInclude }>, ctx: FilledFormInput['drasi']): Promise<Uint8Array> {
    const u = form.participant.user;
    const isMinor = minorAt(u.birthDate, ctx.dateStart, form.participant.kind);
    const template: FormTemplate = form.type === DrasiFormType.SYMMETOXI ? 'dilosi' : isMinor ? 'ygeia-paidi' : 'ygeia-stelexos';
    // Ο κλάδος του παιδιού (για τη δήλωση), αλλιώς ο διοργανωτής.
    const memberKlados = u.memberships[0]?.klados.type as KladosType | undefined;
    let signaturePng: Uint8Array | null = null;
    if (form.signatureFile) {
      try {
        const { stream } = await this.storage.getStream(form.signatureFile.objectKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
        signaturePng = new Uint8Array(Buffer.concat(chunks));
      } catch {
        signaturePng = null;
      }
    }
    return renderFilledForm({
      template,
      drasi: { ...ctx, kladosLabel: memberKlados ? KLADOS_LABEL[memberKlados] : ctx.kladosLabel },
      participant: { firstName: u.firstName, lastName: u.lastName, birthDate: u.birthDate },
      answers: (form.data as Record<string, unknown> | null) ?? {},
      signerName: form.signerName,
      submittedAt: form.submittedAt,
      dueAt: form.expiresAt,
      signaturePng,
    });
  }

  // ───────────────────────── Για τον γονέα (χωρίς συνεδρία) ─────────────────────────

  async open(token: string, ip: string | undefined): Promise<PublicFormView> {
    const form = await this.byToken(token);
    if (form.status === DrasiFormStatus.SENT) {
      await this.prisma.drasiForm.update({ where: { id: form.id }, data: { status: DrasiFormStatus.OPENED, openedAt: new Date() } });
      this.logger.log(`Έντυπο ${form.id} ανοίχτηκε (${ip ?? '-'}).`);
      // «Το άνοιξε»: η δράση το βλέπει αμέσως, όπως και την υποβολή.
      this.collab.broadcast(collabDocument.drasiRoom(form.drasiId), { topic: 'forms', by: null, origin: null });
    }
    const isMinor = minorAt(form.participant.user.birthDate, form.drasi.dateStart, form.participant.kind);
    const u = form.participant.user;
    // Ό,τι ξέρει ήδη το μητρώο, προσυμπληρωμένο — ο γονέας το διορθώνει αν θέλει.
    const prefill: Record<string, string> = {};
    if (form.type === DrasiFormType.YGEIA) {
      const address = [u.street, [u.postalCode, u.city].filter(Boolean).join(' '), u.area].filter(Boolean).join(', ');
      if (address) prefill.address = address;
      if (u.eseoId) prefill.guideId = u.eseoId;
    }
    return {
      prefill,
      signers: allowedSigners(u, isMinor),
      drasi: {
        title: form.drasi.title,
        dateStart: form.drasi.dateStart.toISOString(),
        dateEnd: form.drasi.dateEnd.toISOString(),
        location: form.drasi.location,
        topiko: form.drasi.topiko.name,
        klados: (form.drasi.klados?.type as KladosType | undefined) ?? null,
      },
      participant: { firstName: form.participant.user.firstName, lastName: form.participant.user.lastName },
      type: form.type,
      status: form.status === DrasiFormStatus.SENT ? DrasiFormStatus.OPENED : form.status,
      expiresAt: form.expiresAt!.toISOString(),
      isMinor,
      fields: DRASI_FORM_FIELDS[form.type],
    };
  }

  async submit(token: string, dto: SubmitFormDto, ip: string | undefined): Promise<{ submitted: true }> {
    const form = await this.byToken(token);
    if (form.status === DrasiFormStatus.SUBMITTED) throw new ConflictException('Το έντυπο έχει ήδη υποβληθεί.');

    // Μόνο γνωστά πεδία, μόνο απλές τιμές — ό,τι άλλο στείλει ο client πετιέται.
    // Τα πεδία «μόνο αν…» (π.χ. «αναγράψτε αναλυτικά») μετρούν μόνο όταν ισχύει η συνθήκη τους.
    const isMinor = minorAt(form.participant.user.birthDate, form.drasi.dateStart, form.participant.kind);
    const fields = DRASI_FORM_FIELDS[form.type];
    const answers: Record<string, string | boolean> = {};
    const label = (f: DrasiFormField) => (!isMinor && f.labelAdult ? f.labelAdult : f.label);
    for (const field of fields) {
      if (!formFieldApplies(field, answers, isMinor)) continue;
      const raw = dto.answers[field.key];
      if (field.kind === 'yesno') {
        if (typeof raw === 'boolean') answers[field.key] = raw;
        else if (field.required) throw new BadRequestException(`Απάντησε στο «${label(field)}».`);
      } else {
        const value = typeof raw === 'string' ? raw.trim().slice(0, 2000) : '';
        if (field.required && !value) throw new BadRequestException(`Συμπλήρωσε το «${label(field)}».`);
        if (field.kind === 'select' && value && !field.options?.includes(value)) throw new BadRequestException(`Μη έγκυρη επιλογή στο «${label(field)}».`);
        if (value) answers[field.key] = value;
      }
    }
    if (form.type === DrasiFormType.SYMMETOXI && answers.consent !== true) {
      throw new BadRequestException('Η δήλωση συμμετοχής χρειάζεται τη συναίνεση του γονέα/κηδεμόνα.');
    }

    // Ο υπογράφων: από το μητρώο (γονείς/κηδεμόνες του παιδιού ή ο ίδιος ο ενήλικος) όταν υπάρχει εκεί·
    // ελεύθερο κείμενο μόνο αν το μητρώο δεν ξέρει κανέναν.
    const signers = allowedSigners(form.participant.user, isMinor);
    let signerName = dto.signerName.trim();
    let signerRole = dto.signerRole;
    if (signers.length) {
      const match = signers.find((x) => x.name === signerName);
      if (!match) throw new BadRequestException('Το ονοματεπώνυμο του υπογράφοντος πρέπει να είναι ένα από αυτά του μητρώου.');
      signerName = match.name;
      signerRole = match.role;
    }

    const signatureFileId = dto.signatureDataUrl ? await this.storeSignature(form.drasi.topikoId, form.drasi.kladosId, form.id, dto.signatureDataUrl) : null;

    await this.prisma.drasiForm.update({
      where: { id: form.id },
      data: {
        status: DrasiFormStatus.SUBMITTED,
        data: answers,
        signerName,
        signerRole,
        signatureFileId,
        submittedAt: new Date(),
        submittedIp: ip ?? null,
        // Ο σύνδεσμος πεθαίνει με την υποβολή.
        tokenHash: null,
      },
    });
    this.logger.log(`Έντυπο ${form.id} (${form.type}) υποβλήθηκε από ${ip ?? '-'}.`);
    // Ο γονέας δεν έχει λογαριασμό (ούτε δωμάτιο): η δράση μαθαίνει την υποβολή από εδώ.
    this.collab.broadcast(collabDocument.drasiRoom(form.drasiId), { topic: 'forms', by: null, origin: null });
    return { submitted: true };
  }

  // ───────────────────────── Καθαρισμός ιατρικών ─────────────────────────

  /** Κάθε μέρα 03:30: τα ιατρικά των δράσεων που έληξαν πριν από `HEALTH_DATA_RETENTION_DAYS` σβήνονται. */
  @Cron('30 3 * * *')
  async purgeHealthData(): Promise<number> {
    return this.jobs.track('health-purge', () => this.purgeDueHealthData(), (n) => `${n} έντυπα`);
  }

  private async purgeDueHealthData(): Promise<number> {
    const due = await this.prisma.drasiForm.findMany({
      where: { type: DrasiFormType.YGEIA, purgeAfter: { lt: new Date() }, purgedAt: null },
      include: { signatureFile: true },
    });
    for (const form of due) {
      if (form.signatureFile) {
        await this.storage.delete(form.signatureFile.objectKey).catch(() => undefined);
        await this.prisma.storedFile.delete({ where: { id: form.signatureFile.id } }).catch(() => undefined);
      }
      await this.prisma.drasiForm.update({
        where: { id: form.id },
        data: { data: Prisma.DbNull, signatureFileId: null, tokenHash: null, purgedAt: new Date() },
      });
    }
    if (due.length) this.logger.log(`Καθαρισμός ιατρικών: ${due.length} έντυπα.`);
    return due.length;
  }

  // ───────────────────────── Εσωτερικά ─────────────────────────

  private async byToken(token: string) {
    if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) throw new NotFoundException('Ο σύνδεσμος δεν είναι έγκυρος.');
    const form = await this.prisma.drasiForm.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        drasi: { select: { title: true, dateStart: true, dateEnd: true, location: true, topikoId: true, kladosId: true, topiko: { select: { name: true } }, klados: { select: { type: true } } } },
        participant: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                birthDate: true,
                eseoId: true,
                street: true,
                postalCode: true,
                city: true,
                area: true,
                guardians: { select: { fullName: true, kind: true } },
              },
            },
          },
        },
      },
    });
    if (!form) throw new NotFoundException('Ο σύνδεσμος δεν είναι έγκυρος ή έχει ήδη χρησιμοποιηθεί.');
    if (form.status === DrasiFormStatus.VOID) throw new GoneException('Ο σύνδεσμος ακυρώθηκε — ζητήστε νέο από το στέλεχος.');
    if (form.expiresAt && form.expiresAt < new Date()) throw new GoneException('Ο σύνδεσμος έληξε — ζητήστε νέο από το στέλεχος.');
    return form;
  }

  /** Η ζωγραφισμένη υπογραφή ως PNG στο S3 — ελέγχεται από τα bytes, όχι από το prefix. */
  private async storeSignature(topikoId: string, kladosId: string | null, formId: string, dataUrl: string): Promise<string> {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new BadRequestException('Η υπογραφή πρέπει να είναι εικόνα PNG.');
    const buffer = Buffer.from(match[1]!, 'base64');
    if (buffer.length > MAX_SIGNATURE_BYTES) throw new BadRequestException('Η υπογραφή είναι πολύ μεγάλη.');
    if (sniffMime(buffer) !== 'image/png') throw new BadRequestException('Η υπογραφή δεν είναι έγκυρο PNG.');

    const objectKey = `signature/${topikoId}/${formId}.png`;
    await this.storage.put(objectKey, buffer, 'image/png');
    const stored = await this.prisma.storedFile.create({
      data: { topikoId, kladosId, purpose: 'SIGNATURE', objectKey, filename: 'ypografi.png', contentType: 'image/png', size: buffer.length },
    });
    return stored.id;
  }

  private appUrl(): string {
    const first = this.config.CORS_ORIGINS.split(',')[0]?.trim() ?? '';
    return first.replace(/\/$/, '');
  }
}

const formPdfInclude = {
  participant: {
    include: {
      user: { select: { firstName: true, lastName: true, birthDate: true, memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } } } },
    },
  },
  signatureFile: { select: { objectKey: true } },
} as const;

const FLAG_LABEL: Record<string, string> = {
  epilepsy: 'επιληπτικές κρίσεις',
  panic: 'κρίσεις πανικού',
  claustrophobia: 'κλειστοφοβία',
  nosebleeds: 'ρινορραγίες',
  sleepwalking: 'υπνοβασία',
  enuresis: 'ενούρηση',
  lice: 'ψείρες',
  enzymes: 'έλλειψη ενζύμων',
};

/**
 * Οι επιτρεπτοί υπογράφοντες από το μητρώο: γονείς/κηδεμόνες για ανήλικο, ο ίδιος για ενήλικο.
 * Το e-SEO δίνει για τον γονέα συνήθως ΜΟΝΟ το μικρό όνομα («ΙΩΑΝΝΗΣ»)· τότε το
 * ονοματεπώνυμο σχηματίζεται με το επώνυμο του παιδιού. Αν έχει ήδη δύο λέξεις, μένει ως έχει.
 */
function allowedSigners(
  u: { firstName: string; lastName: string; guardians?: { fullName: string | null; kind: string }[] },
  isMinor: boolean,
): PublicFormView['signers'] {
  if (!isMinor) return [{ name: `${u.firstName} ${u.lastName}`.trim(), role: 'IDIOS' }];
  const seen = new Set<string>();
  const out: PublicFormView['signers'] = [];
  for (const g of u.guardians ?? []) {
    const raw = g.fullName?.trim().replace(/\s+/g, ' ');
    if (!raw) continue;
    const name = raw.includes(' ') ? raw : `${raw} ${u.lastName}`.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, role: g.kind === 'FATHER' || g.kind === 'MOTHER' ? 'GONEAS' : 'KIDEMONAS' });
  }
  return out;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Ανήλικος στην έναρξη της δράσης. Χωρίς ημερομηνία γέννησης το παιδί θεωρείται
 * ανήλικο (καλύτερα ένα έντυπο παραπάνω) και το στέλεχος ενήλικο: αλλιώς ένα
 * στέλεχος με ελλιπή καρτέλα θα ζητούσε δήλωση γονέα. Με ημερομηνία μετράει μόνο
 * η ηλικία — στέλεχος 17 ετών μένει ανήλικο και υπογράφει γονέας.
 */
export function minorAt(birthDate: Date | null, at: Date, kind: string): boolean {
  const age = ageInYears(birthDate, at);
  return age === null ? kind !== MemberKind.STELEXOS : age < 18;
}

function requiredTypes(isMinor: boolean): DrasiFormType[] {
  return isMinor ? [DrasiFormType.SYMMETOXI, DrasiFormType.YGEIA] : [DrasiFormType.YGEIA];
}

function toView(f: {
  id: string;
  participantId: string;
  type: DrasiFormType;
  status: DrasiFormStatus;
  sentAt: Date | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  signerName: string | null;
  signerRole: DrasiFormView['signerRole'];
  data: Prisma.JsonValue | null;
  purgedAt: Date | null;
}): DrasiFormView {
  return {
    id: f.id,
    participantId: f.participantId,
    type: f.type,
    status: f.status,
    sentAt: f.sentAt?.toISOString() ?? null,
    expiresAt: f.expiresAt?.toISOString() ?? null,
    submittedAt: f.submittedAt?.toISOString() ?? null,
    signerName: f.signerName,
    signerRole: f.signerRole,
    hasData: f.data !== null && f.data !== undefined,
    purgedAt: f.purgedAt?.toISOString() ?? null,
  };
}
