import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DrasiReviewKind, MemberKind, type Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import {
  DEFAULT_REVIEW_SETTINGS,
  DRASI_REVIEW_CHOICE_KINDS,
  DRASI_REVIEW_KIND_LABEL,
  DRASI_REVIEW_SCALE_MAX,
  canAccessKlados,
  isSuperAdmin,
  type DrasiReviewAnswerValue,
  type DrasiReviewQuestionView,
  type DrasiReviewSettings,
  type DrasiReviewSummary,
  type DrasiReviewView,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import type { SetReviewAnswersDto, SetReviewQuestionsDto, UpdateReviewSettingsDto } from './dto/drasi-review.dto';

type QuestionRow = Prisma.DrasiReviewQuestionGetPayload<{ include: { answers: { include: { user: { select: { id: true; firstName: true; lastName: true } } } } } }>;
type AnswerRow = QuestionRow['answers'][number];
interface QuestionOptions {
  choices?: string[];
  low?: string;
  high?: string;
}

const answerInclude = { answers: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } } as const;

/**
 * Αξιολόγηση δράσης (F10) σαν φόρμα: ερωτήσεις πολλών ειδών, ρυθμίσεις (κοινό,
 * ανωνυμία, αποδοχή απαντήσεων…), σύνοψη και ατομικές απαντήσεις για τον
 * διαχειριστή, λήψη σε Excel. Μία απάντηση ανά άτομο — και στην ανώνυμη φόρμα
 * το `userId` κρατιέται μόνο γι' αυτό και δεν βγαίνει ποτέ προς τα έξω.
 */
@Injectable()
export class DraseisReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
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

  // ── Προβολή ──

  async view(user: RequestUser, id: string): Promise<DrasiReviewView> {
    const drasi = await this.access.load(user, id, 'read');
    const settings = this.settingsOf(drasi.reviewSettings);
    const questions = await this.prisma.drasiReviewQuestion.findMany({ where: { drasiId: id }, orderBy: { order: 'asc' }, include: answerInclude });

    const manages = this.manages(user, drasi.klados?.type as KladosType | undefined);
    const mineRows = questions.flatMap((q) => q.answers.filter((a) => a.userId === user.id));
    const mineSubmittedAt = mineRows.length ? new Date(Math.max(...mineRows.map((a) => a.updatedAt.getTime()))).toISOString() : null;

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
    const byId = new Map(current.questions.map((q) => [q.id, q]));
    for (const a of dto.answers) if (!byId.has(a.questionId)) throw new BadRequestException('Άγνωστη ερώτηση.');

    const given = new Map(dto.answers.map((a) => [a.questionId, a]));
    const writes: { questionId: string; value: number | null; text: string | null; choices: string[] }[] = [];
    for (const q of current.questions) {
      const a = given.get(q.id);
      const norm = this.normalize(q, a);
      if (!norm) {
        if (q.required) throw new BadRequestException(`Η ερώτηση «${q.text}» είναι υποχρεωτική.`);
        continue;
      }
      writes.push({ questionId: q.id, ...norm });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.drasiReviewAnswer.deleteMany({ where: { userId: user.id, question: { drasiId: id } } });
      if (writes.length) await tx.drasiReviewAnswer.createMany({ data: writes.map((w) => ({ ...w, userId: user.id })) });
    });
    return this.view(user, id);
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

  /** Διαγραφή μιας υποβολής (διαχειριστής) — το key είναι το userId της. */
  async removeResponse(user: RequestUser, id: string, key: string): Promise<DrasiReviewView> {
    await this.access.load(user, id, 'write', { allowClosed: true });
    const r = await this.prisma.drasiReviewAnswer.deleteMany({ where: { userId: key, question: { drasiId: id } } });
    if (!r.count) throw new NotFoundException('Η απάντηση δεν βρέθηκε.');
    return this.view(user, id);
  }

  // ── Σύνοψη ──

  summarize(questions: QuestionRow[], settings: DrasiReviewSettings, withNames: boolean): DrasiReviewSummary {
    const names = settings.anonymous ? null : withNames;
    // Σταθερή αρίθμηση των απαντώντων κατά πρώτη υποβολή — ίδια σε σύνοψη, ατομικά και Excel.
    const firstSeen = new Map<string, { at: number; user: string }>();
    for (const q of questions) {
      for (const a of q.answers) {
        const prev = firstSeen.get(a.userId);
        const at = a.updatedAt.getTime();
        if (!prev || at < prev.at) firstSeen.set(a.userId, { at, user: `${a.user.lastName} ${a.user.firstName}` });
      }
    }
    const ordered = [...firstSeen.entries()].sort((x, y) => x[1].at - y[1].at);
    const label = new Map(ordered.map(([uid, info], i) => [uid, names ? info.user : `Απάντηση #${i + 1}`]));

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
          texts: q.kind === 'TEXT' || q.kind === 'PARAGRAPH' ? q.answers.filter((a) => a.text).map((a) => ({ user: label.get(a.userId) ?? '', text: a.text! })) : [],
        };
      }),
      responses: ordered.map(([uid]) => ({
        key: uid,
        user: label.get(uid) ?? '',
        submittedAt: new Date(Math.max(...questions.flatMap((q) => q.answers.filter((a) => a.userId === uid).map((a) => a.updatedAt.getTime())))).toISOString(),
        answers: questions.flatMap((q) => q.answers.filter((a) => a.userId === uid).map((a) => this.toAnswerValue(a))),
      })),
    };
  }

  // ── Λήψη ──

  /** Οι απαντήσεις σε Excel: μία γραμμή ανά απαντώντα, μία στήλη ανά ερώτηση (+ φύλλο σύνοψης). */
  async workbook(user: RequestUser, id: string): Promise<{ filename: string; buffer: Buffer }> {
    const drasi = await this.access.load(user, id, 'read');
    if (!this.manages(user, drasi.klados?.type as KladosType | undefined)) throw new ForbiddenException('Μόνο όποιος διαχειρίζεται τη δράση κατεβάζει τις απαντήσεις.');
    const settings = this.settingsOf(drasi.reviewSettings);
    const questions = await this.prisma.drasiReviewQuestion.findMany({ where: { drasiId: id }, orderBy: { order: 'asc' }, include: answerInclude });
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
