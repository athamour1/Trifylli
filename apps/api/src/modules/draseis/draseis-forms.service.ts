import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DrasiFormStatus, DrasiFormType, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import {
  DRASI_FORM_FIELDS,
  FORM_LINK_TTL_DAYS,
  HEALTH_DATA_RETENTION_DAYS,
  type DrasiFormsMatrix,
  type DrasiFormView,
  type HealthSummaryEntry,
  type IssuedFormLink,
  type KladosType,
  type PublicFormView,
} from '@trifylli/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { RequestUser } from '../../common/auth/types';
import { ageInYears } from '../meloi/age';
import { sniffMime } from '../files/sniff';
import { DrasiAccessService } from './drasi-access.service';
import type { IssueFormsDto, SubmitFormDto } from './dto/drasi-forms.dto';

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
    @Inject(AppConfigToken) private readonly config: AppConfig,
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
      const isMinor = minorAt(p.user.birthDate, drasi.dateStart);
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

    return { participants: rows, pending, total };
  }

  /**
   * Εκδίδει συνδέσμους. Το token επιστρέφεται **μία φορά** — μετά υπάρχει μόνο
   * το hash. Όσα είναι ήδη συμπληρωμένα δεν ξαναεκδίδονται.
   */
  async issue(user: RequestUser, id: string, dto: IssueFormsDto): Promise<IssuedFormLink[]> {
    const drasi = await this.access.load(user, id, 'write');
    const participants = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id, ...(dto.participantIds?.length ? { id: { in: dto.participantIds } } : {}) },
      include: { user: { select: { birthDate: true } }, forms: true },
    });

    const expiresAt = new Date(Date.now() + FORM_LINK_TTL_DAYS * 86_400_000);
    const purgeAfter = new Date(drasi.dateEnd.getTime() + HEALTH_DATA_RETENTION_DAYS * 86_400_000);
    const links: IssuedFormLink[] = [];

    for (const p of participants) {
      const isMinor = minorAt(p.user.birthDate, drasi.dateStart);
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
        links.push({ participantId: p.id, formId: form.id, type, url: `${this.appUrl()}/forms/${token}`, expiresAt: expiresAt.toISOString() });
      }
    }

    await this.audit.record(user, 'drasi.forms.issue', 'drasi', id, { count: links.length, reissue: dto.reissue ?? false });
    return links;
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
    if (form.type === DrasiFormType.YGEIA) await this.audit.record(user, 'drasi.health.read', 'drasi_form', formId, { drasiId: id });
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

    const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === true ? 'ναι' : v === false ? 'όχι' : '');
    return forms.map((f) => {
      const d = (f.data as Record<string, unknown> | null) ?? {};
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
        allergies: text(d.allergies),
        medications: text(d.medications),
        conditions: text(d.conditions),
        diet: text(d.diet),
        bloodType: text(d.bloodType),
        emergencyPhone: text(d.emergencyPhone),
        notes: text(d.notes),
        submittedAt: f.submittedAt?.toISOString() ?? '',
      };
    });
  }

  // ───────────────────────── Για τον γονέα (χωρίς συνεδρία) ─────────────────────────

  async open(token: string, ip: string | undefined): Promise<PublicFormView> {
    const form = await this.byToken(token);
    if (form.status === DrasiFormStatus.SENT) {
      await this.prisma.drasiForm.update({ where: { id: form.id }, data: { status: DrasiFormStatus.OPENED, openedAt: new Date() } });
      this.logger.log(`Έντυπο ${form.id} ανοίχτηκε (${ip ?? '-'}).`);
    }
    const isMinor = minorAt(form.participant.user.birthDate, form.drasi.dateStart);
    return {
      drasi: {
        title: form.drasi.title,
        dateStart: form.drasi.dateStart.toISOString(),
        dateEnd: form.drasi.dateEnd.toISOString(),
        location: form.drasi.location,
        topiko: form.drasi.topiko.name,
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
    const fields = DRASI_FORM_FIELDS[form.type];
    const answers: Record<string, string | boolean> = {};
    for (const field of fields) {
      const raw = dto.answers[field.key];
      if (field.kind === 'yesno') {
        if (typeof raw === 'boolean') answers[field.key] = raw;
        else if (field.required) throw new BadRequestException(`Απάντησε στο «${field.label}».`);
      } else {
        const value = typeof raw === 'string' ? raw.trim().slice(0, 2000) : '';
        if (field.required && !value) throw new BadRequestException(`Συμπλήρωσε το «${field.label}».`);
        if (field.kind === 'select' && value && !field.options?.includes(value)) throw new BadRequestException(`Μη έγκυρη επιλογή στο «${field.label}».`);
        if (value) answers[field.key] = value;
      }
    }
    if (form.type === DrasiFormType.SYMMETOXI && answers.consent !== true) {
      throw new BadRequestException('Η δήλωση συμμετοχής χρειάζεται τη συναίνεση του γονέα/κηδεμόνα.');
    }

    const signatureFileId = dto.signatureDataUrl ? await this.storeSignature(form.drasi.topikoId, form.drasi.kladosId, form.id, dto.signatureDataUrl) : null;

    await this.prisma.drasiForm.update({
      where: { id: form.id },
      data: {
        status: DrasiFormStatus.SUBMITTED,
        data: answers,
        signerName: dto.signerName.trim(),
        signerRole: dto.signerRole,
        signatureFileId,
        submittedAt: new Date(),
        submittedIp: ip ?? null,
        // Ο σύνδεσμος πεθαίνει με την υποβολή.
        tokenHash: null,
      },
    });
    this.logger.log(`Έντυπο ${form.id} (${form.type}) υποβλήθηκε από ${ip ?? '-'}.`);
    return { submitted: true };
  }

  // ───────────────────────── Καθαρισμός ιατρικών ─────────────────────────

  /** Κάθε μέρα 03:30: τα ιατρικά των δράσεων που έληξαν πριν από `HEALTH_DATA_RETENTION_DAYS` σβήνονται. */
  @Cron('30 3 * * *')
  async purgeHealthData(): Promise<number> {
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
        drasi: { select: { title: true, dateStart: true, dateEnd: true, location: true, topikoId: true, kladosId: true, topiko: { select: { name: true } } } },
        participant: { include: { user: { select: { firstName: true, lastName: true, birthDate: true } } } },
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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function minorAt(birthDate: Date | null, at: Date): boolean {
  const age = ageInYears(birthDate, at);
  // Χωρίς ημερομηνία γέννησης θεωρείται ανήλικος: καλύτερα ένα έντυπο παραπάνω.
  return age === null ? true : age < 18;
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
