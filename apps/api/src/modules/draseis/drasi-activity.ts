import { Injectable, type OnModuleInit } from '@nestjs/common';
import { collabDocument, drasiCan, type CollabPresenceUser, type DrasiActivityView } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollabService } from '../collab/collab.service';
import { DrasiAccessService } from './drasi-access.service';

/** Συνεχόμενες αλλαγές του ίδιου ατόμου στο ίδιο σημείο, με παύση ως 15΄, γίνονται μία γραμμή. */
const SAME_LINE_MS = 15 * 60_000;
/** Πόσες γραμμές δείχνει η ροή. */
const FEED_SIZE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Η τελευταία γραμμή του ίδιου ατόμου στο ίδιο σημείο — συνεχίζεται ή αρχίζει νέα; */
export function sameLine(
  last: { actorId: string | null; topic: string; verb: string; updatedAt: Date } | null,
  next: { actorId: string | null; topic: string; verb: string; at: Date },
): boolean {
  return (
    !!last &&
    last.actorId === next.actorId &&
    last.topic === next.topic &&
    last.verb === next.verb &&
    next.at.getTime() - last.updatedAt.getTime() <= SAME_LINE_MS
  );
}

/** Ένα κοινό έγγραφο της δράσης (`drasi:<id>:item:<id>`, `drasi:<id>:mythos`…) → θέμα της ροής. */
export function activityOfDocument(name: string): { drasiId: string; topic: string } | null {
  const [base, drasiId, kind] = name.split(':');
  if (base !== 'drasi' || !drasiId || !UUID.test(drasiId) || !kind || kind === 'room') return null;
  return { drasiId, topic: `doc:${kind}` };
}

/** Μια αλλαγή μέσω API στο δωμάτιο της δράσης → θέμα της ροής (η ίδια η ροή δεν γράφεται). */
export function activityOfRoom(room: string, topic: string): { drasiId: string; topic: string } | null {
  const [base, drasiId, kind] = room.split(':');
  if (base !== 'drasi' || kind !== 'room' || !drasiId || topic === 'activity') return null;
  return { drasiId, topic };
}

/**
 * Η ροή δραστηριότητας της δράσης (συνεργασία, Φ7): «η Μαρία άλλαξε το
 * ωρολόγιο», «η Σοφία έγραψε σε ένα γεύμα (3)». Γράφεται μόνη της — από κάθε
 * αλλαγή μέσω API στο δωμάτιο της δράσης και από κάθε αποθήκευση των κοινών της
 * εγγράφων — και δίνει το «τι άλλαξε από την τελευταία σου επίσκεψη».
 */
@Injectable()
export class DrasiActivityService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
    private readonly access: DrasiAccessService,
  ) {}

  onModuleInit(): void {
    this.collab.onApiChange((change) => {
      const target = activityOfRoom(change.room, change.topic);
      if (target && change.by) void this.record(target.drasiId, change.by, target.topic, change.verb);
    });
    this.collab.onDocumentWritten((name, writers) => {
      const target = activityOfDocument(name);
      if (!target) return;
      for (const userId of writers) {
        void this.record(target.drasiId, userId, target.topic, 'write');
        // Και στο δωμάτιο της δράσης: η σελίδα βάζει σημαδάκι στην ενότητα.
        this.collab.broadcast(collabDocument.drasiRoom(target.drasiId), { topic: target.topic, by: userId, origin: null });
      }
    });
  }

  /** Μία αλλαγή στη ροή — ή +1 στη γραμμή που ήδη τρέχει. Αποτυχία δεν σταματά την αλλαγή. */
  async record(drasiId: string, actorId: string, topic: string, verb: string, at = new Date()): Promise<void> {
    try {
      const last = await this.prisma.drasiActivity.findFirst({
        where: { drasiId, actorId, topic },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, actorId: true, topic: true, verb: true, updatedAt: true },
      });
      if (last && sameLine(last, { actorId, topic, verb, at })) {
        await this.prisma.drasiActivity.update({ where: { id: last.id }, data: { count: { increment: 1 } } });
        return;
      }
      await this.prisma.drasiActivity.create({ data: { drasiId, actorId, topic, verb } });
    } catch {
      // Η δράση μπορεί να μόλις σβήστηκε, ή ο λογαριασμός — η ροή δεν είναι κρίσιμη.
    }
  }

  /** Οι τελευταίες γραμμές της ροής και πότε είδε τελευταία φορά τη δράση ο χρήστης. */
  async feed(user: RequestUser, drasiId: string): Promise<DrasiActivityView> {
    await this.access.load(user, drasiId, 'read');
    const [events, visit] = await Promise.all([
      this.prisma.drasiActivity.findMany({
        where: { drasiId },
        orderBy: { updatedAt: 'desc' },
        take: FEED_SIZE,
        select: {
          id: true,
          topic: true,
          verb: true,
          count: true,
          updatedAt: true,
          actor: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.drasiVisit.findUnique({ where: { drasiId_userId: { drasiId, userId: user.id } }, select: { seenAt: true } }),
    ]);
    return {
      lastSeenAt: visit?.seenAt.toISOString() ?? null,
      events: events.map((event) => ({
        id: event.id,
        topic: event.topic,
        verb: event.verb,
        count: event.count,
        at: event.updatedAt.toISOString(),
        actor: event.actor,
      })),
    };
  }

  /**
   * Ποιοι δουλεύουν τώρα σε κάθε δράση — για τις κάρτες «Οι δράσεις μου» της
   * αρχικής, που δεν ανοίγουν σύνδεση για καθεμία. Μόνο όσες βλέπει ο χρήστης· ο
   * ίδιος δεν μετράει.
   */
  async presence(user: RequestUser, ids: readonly string[]): Promise<Record<string, CollabPresenceUser[]>> {
    const out: Record<string, CollabPresenceUser[]> = {};
    for (const id of [...new Set(ids)].filter((x) => UUID.test(x)).slice(0, 30)) {
      const access = await this.access.accessFor(user, id).catch(() => null);
      if (!access || !drasiCan(access, 'episkopisi')) continue;
      out[id] = this.collab.presence(collabDocument.drasiRoom(id)).filter((peer) => peer.id !== user.id);
    }
    return out;
  }

  /** Ο χρήστης είδε τη δράση τώρα. */
  async seen(user: RequestUser, drasiId: string): Promise<{ seenAt: string }> {
    await this.access.load(user, drasiId, 'read');
    const seenAt = new Date();
    await this.prisma.drasiVisit.upsert({
      where: { drasiId_userId: { drasiId, userId: user.id } },
      create: { drasiId, userId: user.id, seenAt },
      update: { seenAt },
    });
    return { seenAt: seenAt.toISOString() };
  }
}
