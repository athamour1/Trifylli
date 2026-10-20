import { guestTopikoKey } from '@trifylli/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Ποιος εισπράττει από ποιον: ο υπεύθυνος κάθε φιλοξενούμενου Τοπικού από τους
 * συμμετέχοντες εκείνου του Τοπικού που **δεν έχουν** υπεύθυνο είσπραξης. Μια
 * επιλογή που έγινε με το χέρι δεν αλλάζει, ούτε ο υπεύθυνος γίνεται εισπράκτορας
 * του εαυτού του. Το Τοπικό ενός ατόμου είναι το `guestTopikoName` του.
 */
export function planGuestCollectors(
  topika: readonly { topikoName: string; contactUserId: string | null }[],
  participants: readonly { id: string; userId: string; collectorId: string | null; guestTopikoName: string | null }[],
): Map<string, string[]> {
  const contactOf = new Map(
    topika.flatMap((t) => (t.contactUserId ? [[guestTopikoKey(t.topikoName), t.contactUserId] as const] : [])),
  );
  const plan = new Map<string, string[]>();
  for (const p of participants) {
    if (p.collectorId || !p.guestTopikoName) continue;
    const contact = contactOf.get(guestTopikoKey(p.guestTopikoName));
    if (!contact || contact === p.userId) continue;
    plan.set(contact, [...(plan.get(contact) ?? []), p.id]);
  }
  return plan;
}

/** Εφαρμόζει το `planGuestCollectors` στη δράση. Idempotent: τρέχει μετά από κάθε προσθήκη. */
export async function assignGuestCollectors(prisma: PrismaService, drasiId: string): Promise<void> {
  const topika = await prisma.drasiGuestTopiko.findMany({
    where: { drasiId, contactUserId: { not: null } },
    select: { topikoName: true, contactUserId: true },
  });
  if (!topika.length) return;
  const participants = await prisma.drasiParticipant.findMany({
    where: { drasiId, collectorId: null, user: { guestTopikoName: { not: null } } },
    select: { id: true, userId: true, collectorId: true, user: { select: { guestTopikoName: true } } },
  });
  const plan = planGuestCollectors(
    topika,
    participants.map((p) => ({ id: p.id, userId: p.userId, collectorId: p.collectorId, guestTopikoName: p.user.guestTopikoName })),
  );
  for (const [collectorId, ids] of plan) {
    await prisma.drasiParticipant.updateMany({ where: { id: { in: ids }, collectorId: null }, data: { collectorId } });
  }
}
