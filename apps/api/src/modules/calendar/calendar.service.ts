import { Injectable } from '@nestjs/common';
import { DrasiStatus, Prisma } from '@prisma/client';
import {
  DRASI_TYPE_LABEL,
  KLADOS_META,
  SYMVOULIO_TYPE_LABEL,
  type CalendarEvent,
  type DrasiType,
  type KladosType,
  type SymvoulioType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess, scopedKladoi } from '../../common/util/klados-scope';

/** Χρώμα για γεγονότα που δεν ανήκουν σε κλάδο (Τοπικό). Hex, όπως των κλάδων. */
const TOPIKO_COLOR = '#546e7a';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ενιαία ροή γεγονότων: δράσεις, συγκεντρώσεις και συμβούλια σε ένα σχήμα.
   *
   * Το ημερολόγιο εμφανίζεται πανομοιότυπα σε επίπεδο κλάδου και Τοπικού — η
   * μόνη διαφορά είναι η εμβέλεια. Ένα endpoint αντί για τρία σημαίνει ότι η PWA
   * κατεβάζει τον μήνα με μία κλήση και τον έχει offline.
   */
  async events(
    user: RequestUser,
    from: Date,
    to: Date,
    klados?: KladosType,
  ): Promise<CalendarEvent[]> {
    if (klados) assertKladosAccess(user, klados);

    // `null` ⇒ υπερδιαχειριστής, κανένας περιορισμός κλάδου.
    const scope = scopedKladoi(user);
    const kladosFilter: Prisma.KladosWhereInput = {
      topikoId: user.topikoId,
      ...(klados ? { type: klados } : scope ? { type: { in: scope } } : {}),
    };

    // Οι δράσεις και τα συμβούλια του Τοπικού (χωρίς κλάδο) είναι ορατά σε όλους:
    // αφορούν όλο το Τμήμα και ένας διαχειριστής κλάδου πρέπει να τα βλέπει στο
    // ημερολόγιό του για να μη διπλοκλείσει ημερομηνία.
    const ownerFilter = klados
      ? { klados: { type: klados } }
      : scope
        ? { OR: [{ kladosId: null }, { klados: { type: { in: scope } } }] }
        : {};

    const [draseis, syggentrwseis, symvoulia] = await this.prisma.$transaction([
      this.prisma.drasi.findMany({
        where: {
          topikoId: user.topikoId,
          archivedAt: null,
          // Ένα προσχέδιο (wizard στη μέση) δεν είναι ακόμη δέσμευση ημερομηνίας.
          status: { not: DrasiStatus.PROSXEDIO },
          dateStart: { lte: to },
          dateEnd: { gte: from },
          ...ownerFilter,
        },
        select: {
          id: true,
          title: true,
          type: true,
          dateStart: true,
          dateEnd: true,
          klados: { select: { type: true } },
        },
      }),
      this.prisma.syggentrwsh.findMany({
        where: {
          archivedAt: null,
          date: { gte: from, lte: to },
          klados: kladosFilter,
        },
        select: {
          id: true,
          title: true,
          date: true,
          startTime: true,
          endTime: true,
          klados: { select: { type: true } },
        },
      }),
      this.prisma.symvoulio.findMany({
        where: {
          topikoId: user.topikoId,
          archivedAt: null,
          date: { gte: from, lte: to },
          ...ownerFilter,
        },
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          klados: { select: { type: true } },
        },
      }),
    ]);

    const events: CalendarEvent[] = [
      ...draseis.map((d) => {
        const kladosType = (d.klados?.type as KladosType | undefined) ?? null;
        return {
          id: d.id,
          title: d.title,
          start: d.dateStart.toISOString(),
          end: d.dateEnd.toISOString(),
          allDay: true,
          kind: 'DRASI' as const,
          kladosType,
          drasiType: d.type as DrasiType,
          color: kladosType ? KLADOS_META[kladosType].color : TOPIKO_COLOR,
          href: `/draseis/${d.id}`,
        };
      }),
      ...syggentrwseis.map((s) => {
        const kladosType = s.klados.type as KladosType;
        const start = s.startTime ?? s.date;
        const end = s.endTime ?? addHours(start, 2);
        return {
          id: s.id,
          title: s.title ?? `Συγκέντρωση ${formatDate(s.date)}`,
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: !s.startTime,
          kind: 'SYGGENTRWSH' as const,
          kladosType,
          color: KLADOS_META[kladosType].color,
          href: `/syggentrwseis/${s.id}`,
        };
      }),
      ...symvoulia.map((s) => {
        const kladosType = (s.klados?.type as KladosType | undefined) ?? null;
        return {
          id: s.id,
          title: s.title ?? SYMVOULIO_TYPE_LABEL[s.type as SymvoulioType],
          start: s.date.toISOString(),
          end: addHours(s.date, 2).toISOString(),
          allDay: false,
          kind: 'SYMVOULIO' as const,
          kladosType,
          symvoulioType: s.type as SymvoulioType,
          color: kladosType ? KLADOS_META[kladosType].color : TOPIKO_COLOR,
          href: `/symvoulia/${s.id}`,
        };
      }),
    ];

    return events.sort((a, b) => a.start.localeCompare(b.start));
  }

  /**
   * «Calendar easy view»: τα επόμενα γεγονότα σε συμπαγή λίστα, ομαδοποιημένα
   * κατά ημέρα — αυτό που κοιτάζει ένα στέλεχος στο κινητό πριν τη συγκέντρωση.
   */
  async upcoming(user: RequestUser, days = 30, klados?: KladosType) {
    const from = new Date();
    const to = new Date(from);
    to.setDate(to.getDate() + days);

    const events = await this.events(user, from, to, klados);

    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const day = event.start.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), event]);
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, events: items }));
  }

  /** Σύνοψη για το dashboard: τι τρέχει και τι έρχεται. */
  async dashboard(user: RequestUser) {
    const now = new Date();
    const weekAhead = new Date(now);
    weekAhead.setDate(weekAhead.getDate() + 7);

    const [upcoming, ongoing, unplanned] = await Promise.all([
      this.events(user, now, weekAhead),
      this.prisma.drasi.count({
        where: {
          topikoId: user.topikoId,
          archivedAt: null,
          status: { not: DrasiStatus.PROSXEDIO },
          dateStart: { lte: now },
          dateEnd: { gte: now },
        },
      }),
      // Συγκεντρώσεις των επόμενων ημερών χωρίς ούτε ένα κομμάτι προγράμματος —
      // η πιο συχνή ξεχασμένη ενέργεια, τώρα που ο σχεδιασμός γίνεται μέσα στην
      // εφαρμογή.
      this.prisma.syggentrwsh.count({
        where: {
          archivedAt: null,
          date: { gte: now, lte: weekAhead },
          klados: { topikoId: user.topikoId, ...(scopedKladoi(user) ? { type: { in: user.kladoi } } : {}) },
          timeline: { none: {} },
        },
      }),
    ]);

    return {
      upcoming,
      ongoingDraseis: ongoing,
      unplannedSyggentrwseis: unplanned,
      labels: { drasiTypes: DRASI_TYPE_LABEL, symvoulioTypes: SYMVOULIO_TYPE_LABEL },
    };
  }
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
