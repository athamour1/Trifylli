import { BadRequestException, Injectable } from '@nestjs/common';
import { DrasiReviewKind } from '@prisma/client';
import { isSuperAdmin, type DrasiReviewView, type KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { canAccessKlados } from '@trifylli/shared';
import { DrasiAccessService } from './drasi-access.service';
import type { SetReviewAnswersDto, SetReviewQuestionsDto } from './dto/drasi-review.dto';

/**
 * Αξιολόγηση δράσης (F10), κατ' επιλογήν: εμφανίζεται μόνο αν ο υπεύθυνος
 * προσθέσει ερωτήσεις. Επώνυμη — τα στελέχη απαντούν ως στελέχη, όχι ως κοινό.
 */
@Injectable()
export class DraseisReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
  ) {}

  async view(user: RequestUser, id: string): Promise<DrasiReviewView> {
    const drasi = await this.access.load(user, id, 'read');
    const questions = await this.prisma.drasiReviewQuestion.findMany({
      where: { drasiId: id },
      orderBy: { order: 'asc' },
      include: { answers: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
    });

    const organiser = drasi.klados?.type as KladosType | undefined;
    const profile = { role: user.role, adminKlados: user.adminKlados };
    const manages = isSuperAdmin(profile) || (organiser ? canAccessKlados(profile, organiser) : false);

    return {
      questions: questions.map((q) => ({ id: q.id, order: q.order, text: q.text, kind: q.kind })),
      mine: questions.flatMap((q) =>
        q.answers.filter((a) => a.userId === user.id).map((a) => ({ questionId: q.id, value: a.value, text: a.text })),
      ),
      summary: manages ? this.summarize(questions) : null,
    };
  }

  async setQuestions(user: RequestUser, id: string, dto: SetReviewQuestionsDto) {
    await this.access.load(user, id, 'write', { allowClosed: true });
    const keep = dto.questions.map((q) => q.id).filter((x): x is string => !!x);
    await this.prisma.$transaction(async (tx) => {
      await tx.drasiReviewQuestion.deleteMany({ where: { drasiId: id, id: { notIn: keep } } });
      for (const [order, q] of dto.questions.entries()) {
        if (q.id) {
          await tx.drasiReviewQuestion.updateMany({
            where: { id: q.id, drasiId: id },
            data: { order, text: q.text.trim(), kind: q.kind ?? DrasiReviewKind.TEXT },
          });
        } else {
          await tx.drasiReviewQuestion.create({ data: { drasiId: id, order, text: q.text.trim(), kind: q.kind ?? DrasiReviewKind.TEXT } });
        }
      }
    });
    return this.view(user, id);
  }

  /** Οι απαντήσεις του συνδεδεμένου — όποιος βλέπει τη δράση μπορεί να απαντήσει, και μετά το κλείσιμο. */
  async setAnswers(user: RequestUser, id: string, dto: SetReviewAnswersDto) {
    await this.access.load(user, id, 'read');
    const questions = await this.prisma.drasiReviewQuestion.findMany({ where: { drasiId: id }, select: { id: true, kind: true } });
    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const a of dto.answers) {
      const q = byId.get(a.questionId);
      if (!q) throw new BadRequestException('Άγνωστη ερώτηση.');
      const empty = (q.kind === DrasiReviewKind.SCALE_1_5 ? a.value == null : !a.text?.trim());
      if (empty) {
        await this.prisma.drasiReviewAnswer.deleteMany({ where: { questionId: q.id, userId: user.id } });
        continue;
      }
      await this.prisma.drasiReviewAnswer.upsert({
        where: { questionId_userId: { questionId: q.id, userId: user.id } },
        create: { questionId: q.id, userId: user.id, value: q.kind === DrasiReviewKind.SCALE_1_5 ? a.value : null, text: a.text?.trim() || null },
        update: { value: q.kind === DrasiReviewKind.SCALE_1_5 ? a.value : null, text: a.text?.trim() || null },
      });
    }
    return this.view(user, id);
  }

  summarize(
    questions: {
      id: string;
      kind: DrasiReviewKind;
      answers: { userId: string; value: number | null; text: string | null; user: { firstName: string; lastName: string } }[];
    }[],
  ): NonNullable<DrasiReviewView['summary']> {
    const respondents = new Set(questions.flatMap((q) => q.answers.map((a) => a.userId))).size;
    return {
      respondents,
      questions: questions.map((q) => {
        const values = q.answers.map((a) => a.value).filter((v): v is number => v !== null);
        return {
          questionId: q.id,
          count: q.answers.length,
          average: values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null,
          texts: q.answers.filter((a) => a.text).map((a) => ({ user: `${a.user.lastName} ${a.user.firstName}`, text: a.text! })),
        };
      }),
    };
  }
}
