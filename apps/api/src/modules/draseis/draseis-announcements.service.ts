import { BadRequestException, Injectable } from '@nestjs/common';
import { MemberKind, type DrasiRoleKind } from '@prisma/client';
import { ANNOUNCEMENT_MAX, type DrasiAnnouncementView } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DrasiAccessService } from './drasi-access.service';

/** Πόσες ανακοινώσεις δείχνει η δράση. */
const LIST_SIZE = 30;
const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Ανακοινώσεις προς τα στελέχη της δράσης (συνεργασία, Φ12): σύντομο μήνυμα
 * σε όλα τα στελέχη ή σε ρόλους του αρχηγείου, με ειδοποίηση και «το είδαν 6/9».
 * Χωρίς απαντήσεις — δεν είναι chat (ερώτημα 16). Τις στέλνουν ο Αρχηγός της
 * δράσης και όποιος έχει τις «Ρυθμίσεις».
 */
@Injectable()
export class DraseisAnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Όσοι την παίρνουν: τα στελέχη της δράσης — ή όσοι έχουν αυτούς τους ρόλους. */
  async audience(drasiId: string, roles: readonly DrasiRoleKind[]): Promise<string[]> {
    const holders = await this.prisma.drasiRole.findMany({
      where: { drasiId, ...(roles.length ? { kind: { in: [...roles] } } : {}) },
      select: { userId: true },
    });
    if (roles.length) return [...new Set(holders.map((row) => row.userId))];
    const staff = await this.prisma.drasiParticipant.findMany({ where: { drasiId, kind: MemberKind.STELEXOS }, select: { userId: true } });
    return [...new Set([...staff, ...holders].map((row) => row.userId))];
  }

  async list(user: RequestUser, drasiId: string): Promise<DrasiAnnouncementView[]> {
    await this.access.load(user, drasiId, 'read');
    const rows = await this.prisma.drasiAnnouncement.findMany({
      where: { drasiId },
      orderBy: { createdAt: 'desc' },
      take: LIST_SIZE,
      include: { createdBy: PERSON, seen: { select: { userId: true, seenAt: true } } },
    });
    const ids = [...new Set(rows.flatMap((row) => row.audienceIds))];
    const people = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const byId = new Map(people.map((person) => [person.id, person]));
    return rows.map((row) => {
      const seen = new Map(row.seen.map((entry) => [entry.userId, entry.seenAt]));
      return {
        id: row.id,
        body: row.body,
        roles: row.roles,
        by: row.createdBy,
        at: row.createdAt.toISOString(),
        audience: row.audienceIds
          .map((id) => byId.get(id))
          .filter((person): person is { id: string; firstName: string; lastName: string } => !!person)
          .map((person) => ({ ...person, seenAt: seen.get(person.id)?.toISOString() ?? null })),
        unseen: row.audienceIds.includes(user.id) && !seen.has(user.id),
      };
    });
  }

  /** Στέλνεται σε όσους την αφορούν — το push λέει μόνο «Ανακοίνωση» και πού, όχι το κείμενο. */
  async create(user: RequestUser, drasiId: string, body: string, roles: readonly DrasiRoleKind[]): Promise<{ id: string }> {
    const drasi = await this.access.load(user, drasiId, 'write');
    const text = body.trim();
    if (!text) throw new BadRequestException('Κενή ανακοίνωση.');
    if (text.length > ANNOUNCEMENT_MAX) throw new BadRequestException(`Η ανακοίνωση ξεπερνά τους ${ANNOUNCEMENT_MAX} χαρακτήρες.`);
    const audience = await this.audience(drasiId, roles);
    if (!audience.length) throw new BadRequestException('Δεν υπάρχει κανείς με αυτούς τους ρόλους στη δράση.');

    const row = await this.prisma.drasiAnnouncement.create({
      data: { drasiId, body: text, roles: [...new Set(roles)], audienceIds: audience, createdById: user.id },
      select: { id: true },
    });
    // Όποιος τη στέλνει την έχει «δει».
    if (audience.includes(user.id)) await this.prisma.drasiAnnouncementSeen.create({ data: { announcementId: row.id, userId: user.id } });
    void this.notifications.notify(
      audience.filter((id) => id !== user.id),
      { kind: 'announcement', title: `Ανακοίνωση — δράση «${drasi.title}»`, link: `/draseis/${drasiId}` },
    );
    return row;
  }

  /** Τις είδα (όσες είναι για μένα). */
  async seen(user: RequestUser, drasiId: string, ids: readonly string[]): Promise<void> {
    await this.access.load(user, drasiId, 'read');
    const mine = await this.prisma.drasiAnnouncement.findMany({
      where: { id: { in: [...ids] }, drasiId, audienceIds: { has: user.id } },
      select: { id: true },
    });
    if (!mine.length) return;
    await this.prisma.drasiAnnouncementSeen.createMany({
      data: mine.map((row) => ({ announcementId: row.id, userId: user.id })),
      skipDuplicates: true,
    });
  }

  async remove(user: RequestUser, drasiId: string, announcementId: string): Promise<void> {
    await this.access.load(user, drasiId, 'write', { allowClosed: true });
    await this.prisma.drasiAnnouncement.deleteMany({ where: { id: announcementId, drasiId } });
  }
}
