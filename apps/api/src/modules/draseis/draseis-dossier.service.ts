import { Injectable } from '@nestjs/common';
import { TIMELINE_SECTION_LABEL, TIMELINE_SECTION_ORDER, type DrasiDossier, type KladosType } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import { DraseisFinanceService } from './draseis-finance.service';
import { DraseisFormsService } from './draseis-forms.service';
import { DraseisGroupsService } from './draseis-groups.service';
import { DraseisPlanService } from './draseis-plan.service';
import { DraseisReviewService } from './draseis-review.service';
import { DraseisService } from './draseis.service';

/**
 * Το ντοσιέ (F11): ό,τι χρειάζεται το χαρτί, σε ένα request. Το PDF βγαίνει
 * στον browser (print iframe) — εδώ μόνο τα δεδομένα, ήδη συγκεντρωμένα από
 * τα services που τα ξέρουν, ώστε οι κανόνες εμβέλειας να μην ξαναγράφονται.
 */
@Injectable()
export class DraseisDossierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly draseis: DraseisService,
    private readonly finance: DraseisFinanceService,
    private readonly forms: DraseisFormsService,
    private readonly groups: DraseisGroupsService,
    private readonly plan: DraseisPlanService,
    private readonly review: DraseisReviewService,
  ) {}

  async build(user: RequestUser, id: string, options: { health: boolean; treasury: boolean }): Promise<DrasiDossier> {
    const drasi = await this.access.load(user, id, 'read');
    const [full, days, participants, groups, loading, matrix, symvoulia, reviewView, topiko] = await Promise.all([
      this.draseis.findOne(user, id),
      this.prisma.syggentrwsh.findMany({
        where: { drasiId: id, archivedAt: null },
        orderBy: { date: 'asc' },
        include: {
          parts: { select: { section: true, notes: true } },
          timeline: {
            orderBy: [{ section: 'asc' }, { order: 'asc' }],
            include: {
              responsible: { select: { firstName: true, lastName: true } },
              executor: { select: { firstName: true, lastName: true } },
              yliko: { include: { yliko: { select: { name: true } } } },
            },
          },
        },
      }),
      this.finance.participants(user, id),
      this.groups.groups(user, id),
      this.plan.loadingList(user, id),
      this.forms.matrix(user, id),
      this.prisma.symvoulio.findMany({
        where: { drasiId: id, archivedAt: null },
        orderBy: { date: 'asc' },
        select: { id: true, title: true, date: true, agenda: true, minutes: true, finalizedAt: true },
      }),
      this.review.view(user, id),
      this.prisma.topiko.findUnique({ where: { id: user.topikoId }, select: { name: true } }),
    ]);

    const groupsOf = new Map<string, { kind: (typeof groups.groups)[number]['kind']; name: string }[]>();
    for (const g of groups.groups) {
      for (const m of g.members) {
        const list = groupsOf.get(m.participantId) ?? [];
        list.push({ kind: g.kind, name: g.name });
        groupsOf.set(m.participantId, list);
      }
    }

    const [health, treasury] = await Promise.all([
      options.health ? this.forms.healthSummary(user, id) : Promise.resolve(null),
      options.treasury
        ? Promise.all([this.finance.summary(user, id), this.finance.entries(user, id)]).then(([summary, entries]) => ({ summary, entries }))
        : Promise.resolve(null),
    ]);

    const name = (u: { firstName: string; lastName: string } | null) => (u ? `${u.lastName} ${u.firstName}` : null);

    return {
      drasi: {
        id: drasi.id,
        title: drasi.title,
        type: drasi.type,
        status: drasi.status,
        dateStart: drasi.dateStart.toISOString(),
        dateEnd: drasi.dateEnd.toISOString(),
        location: drasi.location,
        description: drasi.description,
        topiko: topiko?.name ?? '',
        organiser: (drasi.klados?.type as KladosType | undefined) ?? null,
        kladoi: full.kladoi,
        guestTopika: full.guestTopika.map((g) => ({
          id: g.id,
          topikoCode: g.topikoCode,
          topikoName: g.topikoName,
          kladoi: g.kladoi as KladosType[],
          contactName: g.contactName,
          contactPhone: g.contactPhone,
        })),
        roles: full.roles.map((r) => ({ id: r.id, kind: r.kind, note: r.note, user: r.user })),
      },
      days: days.map((d) => ({
        id: d.id,
        title: d.title,
        date: d.date.toISOString(),
        startTime: d.startTime?.toISOString() ?? null,
        location: d.location,
        goal: d.goal,
        sections: TIMELINE_SECTION_ORDER.map((section) => ({
          section,
          label: TIMELINE_SECTION_LABEL[section],
          notes: d.parts.find((p) => p.section === section)?.notes ?? '',
          blocks: d.timeline
            .filter((b) => b.section === section)
            .map((b) => ({
              title: b.title,
              description: b.description,
              durationMin: b.durationMin,
              responsible: name(b.responsible),
              executor: name(b.executor),
              yliko: b.yliko.length ? b.yliko.map((y) => `${y.yliko.name}${y.qty > 1 ? ` ×${y.qty}` : ''}`).join(', ') : null,
            })),
        })).filter((s) => s.blocks.length > 0 || s.notes),
      })),
      participants: participants.map((p) => ({ ...p, groups: groupsOf.get(p.id) ?? [] })),
      groups: groups.groups,
      health,
      loading,
      treasury,
      symvoulia: symvoulia.map((s) => ({ id: s.id, title: s.title, date: s.date.toISOString(), agenda: s.agenda, minutes: s.minutes, finalized: s.finalizedAt !== null })),
      review: reviewView.summary,
      formsPending: { pending: matrix.pending, total: matrix.total },
    };
  }
}
