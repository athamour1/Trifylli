import { BadRequestException, ForbiddenException, GoneException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DrasiFormStatus, DrasiReviewKind, MemberKind, type Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import {
  DEFAULT_REVIEW_SETTINGS,
  DRASI_REVIEW_CHOICE_KINDS,
  DRASI_REVIEW_KIND_LABEL,
  DRASI_REVIEW_SCALE_MAX,
  FORM_LINK_TTL_DAYS,
  canAccessKlados,
  isSuperAdmin,
  type DrasiReviewAnswerValue,
  type DrasiReviewInviteView,
  type DrasiReviewQuestionView,
  type DrasiReviewSettings,
  type DrasiReviewShareView,
  type DrasiReviewSummary,
  type DrasiReviewView,
  type IssuedReviewLink,
  type KladosType,
  type PublicReviewView,
} from '@trifylli/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import type { IssueReviewInvitesDto, PublicReviewAnswersDto, SetReviewAnswersDto, SetReviewQuestionsDto, UpdateReviewSettingsDto } from './dto/drasi-review.dto';

const answerInclude = {
  answers: { include: { user: { select: { id: true, firstName: true, lastName: true } }, guest: { select: { id: true, name: true } } } },
} as const;
type QuestionRow = Prisma.DrasiReviewQuestionGetPayload<{ include: typeof answerInclude }>;
type AnswerRow = QuestionRow['answers'][number];
interface QuestionOptions {
  choices?: string[];
  low?: string;
  high?: string;
}
/** Ποιος απαντά: χρήστης του μητρώου ή επισκέπτης του κοινού συνδέσμου. */
interface Respondent {
  key: string;
  userId?: string;
  guestId?: string;
}
const userKey = (userId: string): string => `user:${userId}`;
const guestKey = (guestId: string): string => `guest:${guestId}`;

/**
 * Αξιολόγηση δράσης (F10) σαν φόρμα: ερωτήσεις πολλών ειδών, ρυθμίσεις (κοινό,
 * ανωνυμία, αποδοχή απαντήσεων…), σύνοψη και ατομικές απαντήσεις για τον
 * διαχειριστή, λήψη σε Excel. Απαντούν (α) συνδεδεμένοι χρήστες, (β) συμμετέχοντες
 * με ΠΡΟΣΩΠΙΚΟ σύνδεσμο (παιδιά χωρίς λογαριασμό), (γ) οποιοσδήποτε με τον ΚΟΙΝΟ
 * σύνδεσμο της δράσης. Μία απάντηση ανά άτομο όπου το άτομο είναι γνωστό· στην
 * ανώνυμη φόρμα το κλειδί του απαντώντα δεν βγαίνει ποτέ προς τα έξω.
 */
@Injectable()
export class DraseisReviewService {
  private readonly logger = new Logger(DraseisReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly audit: AuditService,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {}

  // ── Ρυθμίσεις ──

  settingsOf(raw: unknown): DrasiReviewSettings {
    const stored = (raw && typeof raw === 'object' ? raw : {}) as Partial<DrasiReviewSettings>;
    return { ...DEFAULT_REVIEW_SETTINGS, ...stored };
  }

  async updateSettings(user: RequestUser, id: string, dto: UpdateReviewSettingsDto): Promise<DrasiReviewView> {
    const drasi = await this.access.load(user, id, 'write', { allowClosed: true });
    const next: DrasiReviewSettings = { ...this.settingsOf(drasi.reviewSettings) };
    for (const key of Object.keys(DEFAULT_REVIEW_SETTINGS) as (keyof DrasiReviewSettings)[]) {
      const v = dto[key];
      if (v !== undefined) (next as unknown as Record<string, unknown>)[key] = typeof v === 'string' ? v.trim() : v;
    }
    await this.prisma.drasi.update({ where: { id }, data: { reviewSettings: next as unknown as Prisma.InputJsonValue } });
    return this.view(user, id);
  }

  // ── Προβολή (συνδεδεμένος) ──

  async view(user: RequestUser, id: string): Promise<DrasiReviewView> {
    const drasi = await this.access.load(user, id, 'read');
    const settings = this.settingsOf(drasi.reviewSettings);
    const questions = await this.questions(id);

    const manages = this.manages(user, drasi.klados?.type as KladosType | undefined);
    const key = userKey(user.id);
    const mineRows = questions.flatMap((q) => q.answers.filter((a) => a.respondentKey === key));
    const mineSubmittedAt = latest(mineRows);

    let cannotAnswerReason: string | null = null;
    if (!settings.acceptingResponses) cannotAnswerReason = 'Η φόρμα δεν δέχεται πλέον απαντήσεις.';
    else if (settings.audience === 'STELEXI' && !manages && !(await this.isStelexos(user.id))) cannotAnswerReason = 'Η αξιολόγηση απευθύνεται μόνο σε στελέχη.';
    else if (mineSubmittedAt && !settings.allowEdit) cannotAnswerReason = 'Έχεις ήδη απαντήσει — η φόρμα δεν επιτρέπει αλλαγή.';

    const showSummary = manages || (settings.showSummary && !!mineSubmittedAt);
    return {
      settings,
      questions: questions.map((q) => this.toQuestionView(q)),
      mine: mineRows.map((a) => this.toAnswerValue(a)),
      mineSubmittedAt,
      canAnswer: !cannotAnswerReason,
      cannotAnswerReason,
      summary: showSummary ? this.summarize(questions, settings, manages) : null,
    };
  }

  private questions(drasiId: string): Promise<QuestionRow[]> {
    return this.prisma.drasiReviewQuestion.findMany({ where: { drasiId }, orderBy: { order: 'asc' }, include: answerInclude });
  }

  private manages(user: RequestUser, organiser: KladosType | undefined): boolean {
    const profile = { role: user.role, adminKlados: user.adminKlados };
    return isSuperAdmin(profile) || (organiser ? canAccessKlados(profile, organiser) : false);
  }

  private async isStelexos(userId: string): Promise<boolean> {
    return (await this.prisma.membership.count({ where: { userId, kind: MemberKind.STELEXOS } })) > 0;
  }

  private toQuestionView(q: QuestionRow): DrasiReviewQuestionView {
    const o = (q.options ?? {}) as QuestionOptions;
    return {
      id: q.id,
      order: q.order,
      text: q.text,
      description: q.description,
      kind: q.kind,
      required: q.required,
      options: Array.isArray(o.choices) ? o.choices : [],
      scaleLow: o.low ?? null,
      scaleHigh: o.high ?? null,
    };
  }

  private toAnswerValue(a: AnswerRow): DrasiReviewAnswerValue {
    return { questionId: a.questionId, value: a.value, text: a.text, choices: a.choices };
  }

  // ── Ερωτήσεις ──

  async setQuestions(user: RequestUser, id: string, dto: SetReviewQuestionsDto): Promise<DrasiReviewView> {
    await this.access.load(user, id, 'write', { allowClosed: true });
    const keep = dto.questions.map((q) => q.id).filter((x): x is string => !!x);
    await this.prisma.$transaction(async (tx) => {
      await tx.drasiReviewQuestion.deleteMany({ where: { drasiId: id, id: { notIn: keep } } });
      for (const [order, q] of dto.questions.entries()) {
        const kind = q.kind ?? DrasiReviewKind.TEXT;
        const options: QuestionOptions = {};
        if (DRASI_REVIEW_CHOICE_KINDS.includes(kind)) options.choices = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
        if (DRASI_REVIEW_SCALE_MAX[kind]) {
          if (q.scaleLow?.trim()) options.low = q.scaleLow.trim();
          if (q.scaleHigh?.trim()) options.high = q.scaleHigh.trim();
        }
        const data = {
          order,
          text: q.text.trim(),
          description: q.description?.trim() || null,
          kind,
          required: q.required ?? false,
          options: options as Prisma.InputJsonValue,
        };
        if (q.id) await tx.drasiReviewQuestion.updateMany({ where: { id: q.id, drasiId: id }, data });
        else await tx.drasiReviewQuestion.create({ data: { drasiId: id, ...data } });
      }
    });
    return this.view(user, id);
  }

  // ── Απαντήσεις ──

  /** Η υποβολή του συνδεδεμένου: ελέγχει κοινό, αποδοχή, υποχρεωτικά, και γράφει όλες τις απαντήσεις μαζί. */
  async setAnswers(user: RequestUser, id: string, dto: SetReviewAnswersDto): Promise<DrasiReviewView> {
    const current = await this.view(user, id);
    if (!current.canAnswer) throw new ForbiddenException(current.cannotAnswerReason ?? 'Δεν μπορείς να απαντήσεις.');
    await this.writeAnswers(id, { key: userKey(user.id), userId: user.id }, current.questions, dto.answers);
    return this.view(user, id);
  }

  /** Γράφει ΟΛΕΣ τις απαντήσεις ενός απαντώντα μαζί (αντικαθιστώντας τις προηγούμενες), με έλεγχο υποχρεωτικών. */
  private async writeAnswers(
    drasiId: string,
    who: Respondent,
    questions: DrasiReviewQuestionView[],
    answers: { questionId: string; value?: number | null; text?: string | null; choices?: string[] }[],
  ): Promise<void> {
    const known = new Set(questions.map((q) => q.id));
    for (const a of answers) if (!known.has(a.questionId)) throw new BadRequestException('Άγνωστη ερώτηση.');
    const given = new Map(answers.map((a) => [a.questionId, a]));
    const writes: { questionId: string; value: number | null; text: string | null; choices: string[] }[] = [];
    for (const q of questions) {
      const norm = this.normalize(q, given.get(q.id));
      if (!norm) {
        if (q.required) throw new BadRequestException(`Η ερώτηση «${q.text}» είναι υποχρεωτική.`);
        continue;
      }
      writes.push({ questionId: q.id, ...norm });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.drasiReviewAnswer.deleteMany({ where: { respondentKey: who.key, question: { drasiId } } });
      if (writes.length) {
        await tx.drasiReviewAnswer.createMany({
          data: writes.map((w) => ({ ...w, respondentKey: who.key, userId: who.userId ?? null, guestId: who.guestId ?? null })),
        });
      }
    });
  }

  /** Κανονικοποίηση ανά είδος· `null` ⇒ κενή απάντηση. */
  private normalize(
    q: DrasiReviewQuestionView,
    a: { value?: number | null; text?: string | null; choices?: string[] } | undefined,
  ): { value: number | null; text: string | null; choices: string[] } | null {
    if (!a) return null;
    const max = DRASI_REVIEW_SCALE_MAX[q.kind];
    if (max) {
      if (a.value == null) return null;
      if (a.value < 1 || a.value > max) throw new BadRequestException(`Η κλίμακα της «${q.text}» είναι 1–${max}.`);
      return { value: a.value, text: null, choices: [] };
    }
    if (q.kind === 'CHOICE') {
      const t = a.text?.trim();
      if (!t) return null;
      if (!q.options.includes(t)) throw new BadRequestException(`Άγνωστη επιλογή στην «${q.text}».`);
      return { value: null, text: t, choices: [] };
    }
    if (q.kind === 'CHECKBOX') {
      const picked = [...new Set((a.choices ?? []).map((c) => c.trim()).filter(Boolean))];
      if (!picked.length) return null;
      for (const c of picked) if (!q.options.includes(c)) throw new BadRequestException(`Άγνωστη επιλογή στην «${q.text}».`);
      return { value: null, text: null, choices: picked };
    }
    const t = a.text?.trim();
    return t ? { value: null, text: t, choices: [] } : null;
  }

  /** Διαγραφή μιας υποβολής (διαχειριστής) — το key είναι το `respondentKey` της. */
  async removeResponse(user: RequestUser, id: string, key: string): Promise<DrasiReviewView> {
    await this.access.load(user, id, 'write', { allowClosed: true });
    if (!/^(user|guest):[0-9a-f-]{36}$/.test(key)) throw new BadRequestException('Μη έγκυρο κλειδί απάντησης.');
    const r = await this.prisma.drasiReviewAnswer.deleteMany({ where: { respondentKey: key, question: { drasiId: id } } });
    if (!r.count) throw new NotFoundException('Η απάντηση δεν βρέθηκε.');
    if (key.startsWith('guest:')) await this.prisma.drasiReviewGuest.deleteMany({ where: { id: key.slice(6), drasiId: id } });
    return this.view(user, id);
  }

  // ── Προσωπικοί σύνδεσμοι: προς συμμετέχοντες χωρίς λογαριασμό (παιδιά) ──

  /** Ποιος συμμετέχων έχει σύνδεσμο και σε τι κατάσταση — όπως ο πίνακας των εντύπων. */
  async invites(user: RequestUser, id: string): Promise<DrasiReviewInviteView[]> {
    await this.access.load(user, id, 'read');
    const participants = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id },
      include: { user: { select: { firstName: true, lastName: true, kind: true, birthDate: true } }, reviewInvite: true },
      orderBy: [{ kind: 'desc' }, { user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
    return participants.map((p) => ({
      participantId: p.id,
      user: { ...p.user, birthDate: p.user.birthDate?.toISOString() ?? null },
      inviteId: p.reviewInvite?.id ?? null,
      status: p.reviewInvite?.status ?? DrasiFormStatus.PENDING,
      sentAt: p.reviewInvite?.sentAt?.toISOString() ?? null,
      expiresAt: p.reviewInvite?.expiresAt?.toISOString() ?? null,
      answeredAt: p.reviewInvite?.answeredAt?.toISOString() ?? null,
    }));
  }

  /** Εκδίδει συνδέσμους· το token επιστρέφεται ΜΙΑ φορά. Όσοι απάντησαν δεν ξαναπαίρνουν (εκτός αν επιτρέπεται αλλαγή). */
  async issueInvites(user: RequestUser, id: string, dto: IssueReviewInvitesDto): Promise<IssuedReviewLink[]> {
    const drasi = await this.access.load(user, id, 'write', { allowClosed: true });
    const settings = this.settingsOf(drasi.reviewSettings);
    const participants = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id, ...(dto.participantIds?.length ? { id: { in: dto.participantIds } } : {}) },
      include: { reviewInvite: true },
    });
    const expiresAt = new Date(Date.now() + FORM_LINK_TTL_DAYS * 86_400_000);
    const links: IssuedReviewLink[] = [];
    for (const p of participants) {
      const existing = p.reviewInvite;
      if (existing?.status === DrasiFormStatus.SUBMITTED && !settings.allowEdit) continue;
      if (existing && (existing.status === DrasiFormStatus.SENT || existing.status === DrasiFormStatus.OPENED) && !dto.reissue) continue;
      const token = randomBytes(32).toString('base64url');
      const invite = await this.prisma.drasiReviewInvite.upsert({
        where: { participantId: p.id },
        create: { drasiId: id, participantId: p.id, status: DrasiFormStatus.SENT, tokenHash: hashToken(token), expiresAt, sentAt: new Date() },
        update: {
          status: existing?.status === DrasiFormStatus.SUBMITTED ? DrasiFormStatus.SUBMITTED : DrasiFormStatus.SENT,
          tokenHash: hashToken(token),
          expiresAt,
          sentAt: new Date(),
          openedAt: null,
        },
      });
      links.push({ participantId: p.id, inviteId: invite.id, url: `${this.appUrl()}/review/${token}`, expiresAt: expiresAt.toISOString() });
    }
    await this.audit.record(user, 'drasi.review.invite', 'drasi', id, { count: links.length, reissue: dto.reissue ?? false });
    return links;
  }

  async voidInvite(user: RequestUser, id: string, inviteId: string): Promise<{ voided: true }> {
    await this.access.load(user, id, 'write', { allowClosed: true });
    const inv = await this.prisma.drasiReviewInvite.findFirst({ where: { id: inviteId, drasiId: id } });
    if (!inv) throw new NotFoundException('Η πρόσκληση δεν βρέθηκε.');
    await this.prisma.drasiReviewInvite.update({ where: { id: inviteId }, data: { status: DrasiFormStatus.VOID, tokenHash: null } });
    return { voided: true };
  }

  // ── Κοινός σύνδεσμος: ένας για όλους, για ομάδα/ανακοίνωση ──

  async shareStatus(user: RequestUser, id: string): Promise<DrasiReviewShareView> {
    const drasi = await this.access.load(user, id, 'read');
    const guests = await this.prisma.drasiReviewGuest.count({ where: { drasiId: id, answers: { some: {} } } });
    return { active: !!drasi.reviewShareTokenHash, createdAt: drasi.reviewShareCreatedAt?.toISOString() ?? null, guestResponses: guests };
  }

  /** Νέος κοινός σύνδεσμος (ο προηγούμενος, αν υπήρχε, παύει). Το token επιστρέφεται ΜΙΑ φορά. */
  async createShareLink(user: RequestUser, id: string): Promise<{ url: string }> {
    await this.access.load(user, id, 'write', { allowClosed: true });
    const token = randomBytes(32).toString('base64url');
    await this.prisma.drasi.update({ where: { id }, data: { reviewShareTokenHash: hashToken(token), reviewShareCreatedAt: new Date() } });
    await this.audit.record(user, 'drasi.review.share', 'drasi', id, {});
    return { url: `${this.appUrl()}/review/${token}` };
  }

  async revokeShareLink(user: RequestUser, id: string): Promise<DrasiReviewShareView> {
    await this.access.load(user, id, 'write', { allowClosed: true });
    await this.prisma.drasi.update({ where: { id }, data: { reviewShareTokenHash: null, reviewShareCreatedAt: null } });
    return this.shareStatus(user, id);
  }

  // ── Δημόσια πλευρά (χωρίς συνεδρία): προσωπικός ή κοινός σύνδεσμος ──

  async openPublic(token: string, ip: string | undefined, guestId: string | undefined): Promise<PublicReviewView> {
    const ctx = await this.byToken(token);
    if (ctx.invite?.status === DrasiFormStatus.SENT) {
      await this.prisma.drasiReviewInvite.update({ where: { id: ctx.invite.id }, data: { status: DrasiFormStatus.OPENED, openedAt: new Date() } });
      this.logger.log(`Αξιολόγηση ${ctx.invite.id} ανοίχτηκε (${ip ?? '-'}).`);
    }
    return this.publicView(ctx, await this.guestOf(ctx, guestId));
  }

  async submitPublic(token: string, dto: PublicReviewAnswersDto, ip: string | undefined): Promise<PublicReviewView> {
    const ctx = await this.byToken(token);
    let guest = await this.guestOf(ctx, dto.guestId);
    const before = await this.publicView(ctx, guest);
    if (!before.canAnswer) throw new ForbiddenException(before.cannotAnswerReason ?? 'Η φόρμα δεν δέχεται απαντήσεις.');

    let who: Respondent;
    if (ctx.invite) {
      who = { key: userKey(ctx.invite.participant.userId), userId: ctx.invite.participant.userId };
    } else {
      // Κοινός σύνδεσμος: ο επισκέπτης φτιάχνεται στην πρώτη υποβολή· με το guestId ξαναβρίσκεται για αλλαγή.
      const name = dto.name?.trim() || null;
      if (before.askName && !name) throw new BadRequestException('Γράψε το όνομά σου.');
      guest = guest
        ? await this.prisma.drasiReviewGuest.update({ where: { id: guest.id }, data: { name } })
        : await this.prisma.drasiReviewGuest.create({ data: { drasiId: ctx.drasi.id, name } });
      who = { key: guestKey(guest.id), guestId: guest.id };
    }
    await this.writeAnswers(ctx.drasi.id, who, before.questions, dto.answers);
    if (ctx.invite) {
      await this.prisma.drasiReviewInvite.update({ where: { id: ctx.invite.id }, data: { status: DrasiFormStatus.SUBMITTED, answeredAt: new Date() } });
    }
    this.logger.log(`Αξιολόγηση ${ctx.invite ? ctx.invite.id : 'κοινός σύνδεσμος'} υποβλήθηκε (${ip ?? '-'}).`);
    return this.publicView(ctx, guest);
  }

  private async byToken(token: string): Promise<PublicContext> {
    if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) throw new NotFoundException('Ο σύνδεσμος δεν είναι έγκυρος.');
    const hash = hashToken(token);
    const drasiSelect = { id: true, title: true, dateStart: true, dateEnd: true, reviewSettings: true, topiko: { select: { name: true } } } as const;
    const inv = await this.prisma.drasiReviewInvite.findUnique({
      where: { tokenHash: hash },
      include: { drasi: { select: drasiSelect }, participant: { select: { userId: true, user: { select: { firstName: true, lastName: true } } } } },
    });
    if (inv) {
      if (inv.status === DrasiFormStatus.VOID) throw new GoneException('Ο σύνδεσμος ακυρώθηκε — ζητήστε νέο από το στέλεχος.');
      if (inv.expiresAt && inv.expiresAt < new Date()) throw new GoneException('Ο σύνδεσμος έληξε — ζητήστε νέο από το στέλεχος.');
      return { drasi: inv.drasi, invite: inv };
    }
    const drasi = await this.prisma.drasi.findUnique({ where: { reviewShareTokenHash: hash }, select: drasiSelect });
    if (!drasi) throw new NotFoundException('Ο σύνδεσμος δεν είναι έγκυρος ή έχει ακυρωθεί.');
    return { drasi, invite: null };
  }

  /** Ο επισκέπτης του κοινού συνδέσμου, αν ο browser θυμάται το guestId του — και μόνο αν ανήκει σε αυτή τη δράση. */
  private async guestOf(ctx: PublicContext, guestId: string | undefined) {
    if (ctx.invite || !guestId || !/^[0-9a-f-]{36}$/.test(guestId)) return null;
    return this.prisma.drasiReviewGuest.findFirst({ where: { id: guestId, drasiId: ctx.drasi.id } });
  }

  private async publicView(ctx: PublicContext, guest: { id: string; name: string | null } | null): Promise<PublicReviewView> {
    const settings = this.settingsOf(ctx.drasi.reviewSettings);
    const questions = await this.questions(ctx.drasi.id);
    const key = ctx.invite ? userKey(ctx.invite.participant.userId) : guest ? guestKey(guest.id) : null;
    const mineRows = key ? questions.flatMap((q) => q.answers.filter((a) => a.respondentKey === key)) : [];
    const mineSubmittedAt = latest(mineRows);
    let cannotAnswerReason: string | null = null;
    if (!settings.acceptingResponses) cannotAnswerReason = 'Η φόρμα δεν δέχεται πλέον απαντήσεις.';
    else if (mineSubmittedAt && !settings.allowEdit) cannotAnswerReason = 'Έχεις ήδη απαντήσει — η φόρμα δεν επιτρέπει αλλαγή.';
    return {
      mode: ctx.invite ? 'personal' : 'shared',
      drasi: { title: ctx.drasi.title, dateStart: ctx.drasi.dateStart.toISOString(), dateEnd: ctx.drasi.dateEnd.toISOString(), topiko: ctx.drasi.topiko.name },
      participant: ctx.invite ? ctx.invite.participant.user : null,
      askName: !ctx.invite && !settings.anonymous,
      guestId: guest?.id ?? null,
      guestName: guest?.name ?? null,
      settings: {
        title: settings.title,
        description: settings.description,
        anonymous: settings.anonymous,
        allowEdit: settings.allowEdit,
        showSummary: settings.showSummary,
        confirmationMessage: settings.confirmationMessage,
      },
      questions: questions.map((q) => this.toQuestionView(q)),
      mine: mineRows.map((a) => this.toAnswerValue(a)),
      mineSubmittedAt,
      canAnswer: !cannotAnswerReason,
      cannotAnswerReason,
      summary: settings.showSummary && mineSubmittedAt ? this.summarize(questions, settings, false) : null,
    };
  }

  private appUrl(): string {
    const first = this.config.CORS_ORIGINS.split(',')[0]?.trim() ?? '';
    return first.replace(/\/$/, '');
  }

  // ── Σύνοψη ──

  summarize(questions: QuestionRow[], settings: DrasiReviewSettings, withNames: boolean): DrasiReviewSummary {
    const names = settings.anonymous ? false : withNames;
    // Σταθερή αρίθμηση των απαντώντων κατά πρώτη υποβολή — ίδια σε σύνοψη, ατομικά και Excel.
    const firstSeen = new Map<string, { at: number; name: string }>();
    for (const q of questions) {
      for (const a of q.answers) {
        const prev = firstSeen.get(a.respondentKey);
        const at = a.updatedAt.getTime();
        if (!prev || at < prev.at) firstSeen.set(a.respondentKey, { at, name: respondentName(a) });
      }
    }
    const ordered = [...firstSeen.entries()].sort((x, y) => x[1].at - y[1].at);
    const label = new Map(ordered.map(([k, info], i) => [k, names && info.name ? info.name : `Απάντηση #${i + 1}`]));

    return {
      respondents: ordered.length,
      questions: questions.map((q) => {
        const view = this.toQuestionView(q);
        const max = DRASI_REVIEW_SCALE_MAX[q.kind];
        let distribution: { label: string; count: number }[] = [];
        if (max) {
          distribution = Array.from({ length: max }, (_, i) => ({ label: String(i + 1), count: q.answers.filter((a) => a.value === i + 1).length }));
        } else if (q.kind === 'CHOICE') {
          distribution = view.options.map((o) => ({ label: o, count: q.answers.filter((a) => a.text === o).length }));
        } else if (q.kind === 'CHECKBOX') {
          distribution = view.options.map((o) => ({ label: o, count: q.answers.filter((a) => a.choices.includes(o)).length }));
        }
        const values = q.answers.map((a) => a.value).filter((v): v is number => v !== null);
        return {
          questionId: q.id,
          count: q.answers.length,
          average: values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null,
          distribution,
          texts: q.kind === 'TEXT' || q.kind === 'PARAGRAPH' ? q.answers.filter((a) => a.text).map((a) => ({ user: label.get(a.respondentKey) ?? '', text: a.text! })) : [],
        };
      }),
      responses: ordered.map(([k]) => ({
        key: k,
        user: label.get(k) ?? '',
        submittedAt: latest(questions.flatMap((q) => q.answers.filter((a) => a.respondentKey === k))) ?? '',
        answers: questions.flatMap((q) => q.answers.filter((a) => a.respondentKey === k).map((a) => this.toAnswerValue(a))),
      })),
    };
  }

  // ── Λήψη ──

  /** Οι απαντήσεις σε Excel: μία γραμμή ανά απαντώντα, μία στήλη ανά ερώτηση (+ φύλλο σύνοψης). */
  async workbook(user: RequestUser, id: string): Promise<{ filename: string; buffer: Buffer }> {
    const drasi = await this.access.load(user, id, 'read');
    if (!this.manages(user, drasi.klados?.type as KladosType | undefined)) throw new ForbiddenException('Μόνο όποιος διαχειρίζεται τη δράση κατεβάζει τις απαντήσεις.');
    const settings = this.settingsOf(drasi.reviewSettings);
    const questions = await this.questions(id);
    const summary = this.summarize(questions, settings, true);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Trifylli';
    wb.created = new Date();
    const header = (row: ExcelJS.Row) => {
      row.font = { bold: true };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF4' } };
    };

    const ws = wb.addWorksheet('Απαντήσεις');
    const head = ['Χρονοσήμανση', settings.anonymous ? 'Απάντηση' : 'Όνομα', ...questions.map((q) => q.text)];
    header(ws.addRow(head));
    ws.columns = head.map((_, i) => ({ width: i === 0 ? 20 : i === 1 ? 28 : 32 }));
    for (const r of summary.responses) {
      const byQ = new Map(r.answers.map((a) => [a.questionId, a]));
      ws.addRow([
        new Date(r.submittedAt),
        r.user,
        ...questions.map((q) => {
          const a = byQ.get(q.id);
          if (!a) return '';
          if (a.value !== null) return a.value;
          if (a.choices.length) return a.choices.join('; ');
          return a.text ?? '';
        }),
      ]);
    }
    ws.getColumn(1).numFmt = 'dd/mm/yyyy hh:mm';
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    const sum = wb.addWorksheet('Σύνοψη');
    sum.columns = [{ width: 48 }, { width: 28 }, { width: 12 }];
    sum.addRow([settings.title || `Αξιολόγηση — ${drasi.title}`]).font = { bold: true, size: 14 };
    sum.addRow([`${summary.respondents} απαντήσεις`]);
    sum.addRow([]);
    for (const q of questions) {
      const s = summary.questions.find((x) => x.questionId === q.id)!;
      header(sum.addRow([q.text, DRASI_REVIEW_KIND_LABEL[q.kind], s.count]));
      if (s.average !== null) sum.addRow(['Μέσος όρος', s.average]);
      for (const d of s.distribution) sum.addRow([d.label, d.count]);
      for (const t of s.texts) sum.addRow([t.text, t.user]);
      sum.addRow([]);
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { filename: `Αξιολόγηση - ${drasi.title}.xlsx`, buffer };
  }
}

/** Τι βρήκε ο δημόσιος σύνδεσμος: πρόσκληση συμμετέχοντα ή μόνο τη δράση (κοινός σύνδεσμος). */
interface PublicContext {
  drasi: { id: string; title: string; dateStart: Date; dateEnd: Date; reviewSettings: Prisma.JsonValue | null; topiko: { name: string } };
  invite: { id: string; status: DrasiFormStatus; participant: { userId: string; user: { firstName: string; lastName: string } } } | null;
}

function respondentName(a: AnswerRow): string {
  if (a.user) return `${a.user.lastName} ${a.user.firstName}`.trim();
  return a.guest?.name?.trim() ?? '';
}

function latest(rows: { updatedAt: Date }[]): string | null {
  return rows.length ? new Date(Math.max(...rows.map((a) => a.updatedAt.getTime()))).toISOString() : null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
