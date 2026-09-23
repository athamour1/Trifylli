import { Injectable, Logger } from '@nestjs/common';
import { DataSource, YlikoCategory } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { OuchtrackerClient } from '../integrations/ouchtracker.client';

/**
 * Φαρμακείο — καθρέφτης του Ouchtracker.
 *
 * Το Ouchtracker παραμένει η πηγή αλήθειας. Εδώ κρατάμε αντίγραφο ώστε:
 *  * το υλικό φαρμακείου να εμφανίζεται μαζί με το υπόλοιπο υλικό, και
 *  * να υπάρχει πρόσβαση στην κατασκήνωση όταν δεν υπάρχει δίκτυο.
 *
 * Ο συγχρονισμός είναι idempotent μέσω του `externalId`: δεν δημιουργεί ποτέ
 * διπλότυπα, ακόμη κι αν τρέξει δέκα φορές.
 */
@Injectable()
export class FarmakeioService {
  private readonly logger = new Logger(FarmakeioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ouchtracker: OuchtrackerClient,
  ) {}

  /** Το τοπικό αντίγραφο του φαρμακείου. Δουλεύει και χωρίς Ouchtracker. */
  async inventory(user: RequestUser) {
    const items = await this.prisma.yliko.findMany({
      where: { topikoId: user.topikoId, category: YlikoCategory.FARMAKEIO, archivedAt: null },
      orderBy: [{ expiresAt: 'asc' }, { name: 'asc' }],
    });

    const now = Date.now();
    const soon = now + 60 * 24 * 3_600_000;

    return {
      configured: this.ouchtracker.configured,
      lastSyncedAt: items.reduce<Date | null>(
        (latest, item) => (item.lastSyncedAt && (!latest || item.lastSyncedAt > latest) ? item.lastSyncedAt : latest),
        null,
      ),
      items: items.map((item) => ({
        id: item.id,
        externalId: item.externalId,
        name: item.name,
        qty: item.totalQty,
        unit: item.unit,
        minQty: item.minQty,
        storageLocation: item.storageLocation,
        expiresAt: item.expiresAt,
        expired: item.expiresAt !== null && item.expiresAt.getTime() < now,
        expiringSoon: item.expiresAt !== null && item.expiresAt.getTime() >= now && item.expiresAt.getTime() <= soon,
        lowStock: item.minQty !== null && item.totalQty <= item.minQty,
      })),
    };
  }

  /** Τα περιστατικά, με προαιρετικό φιλτράρισμα ανά δράση/κατασκήνωση. */
  async incidents(user: RequestUser, drasiId?: string) {
    return this.prisma.incident.findMany({
      where: { topikoId: user.topikoId, ...(drasiId ? { drasiId } : {}) },
      orderBy: { occurredAt: 'desc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        drasi: { select: { id: true, title: true } },
      },
    });
  }

  /**
   * Συγχρονισμός inventory φαρμακείου από Ouchtracker.
   *
   * Τα είδη που έχουν `externalId` και δεν επέστρεψαν από το Ouchtracker
   * αρχειοθετούνται αντί να διαγραφούν: μπορεί να είναι προσωρινή διαφορά
   * έκδοσης του API και δεν θέλουμε να χάσουμε ιστορικό.
   */
  async syncInventory(user: RequestUser) {
    const run = await this.prisma.syncRun.create({
      data: { topikoId: user.topikoId, source: DataSource.OUCHTRACKER },
    });

    try {
      const remote = await this.ouchtracker.inventory();
      const seen = new Set<string>();
      let created = 0;
      let updated = 0;

      for (const item of remote) {
        seen.add(item.id);
        const expiresAt = item.expirationDate ? new Date(item.expirationDate) : null;
        // Το Ouchtracker ομαδοποιεί τα είδη σε Kits· κρατάμε όνομα Kit + θέση.
        const storageLocation =
          [item.kitName, item.locationInKit].filter(Boolean).join(' · ') || undefined;

        const existing = await this.prisma.yliko.findUnique({
          where: { topikoId_externalId: { topikoId: user.topikoId, externalId: item.id } },
          select: { id: true },
        });

        await this.prisma.yliko.upsert({
          where: { topikoId_externalId: { topikoId: user.topikoId, externalId: item.id } },
          create: {
            topikoId: user.topikoId,
            externalId: item.id,
            name: item.name,
            category: YlikoCategory.FARMAKEIO,
            totalQty: item.quantity,
            unit: item.unit ?? undefined,
            storageLocation,
            expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : undefined,
            consumable: true,
            source: DataSource.OUCHTRACKER,
            lastSyncedAt: new Date(),
          },
          update: {
            name: item.name,
            totalQty: item.quantity,
            unit: item.unit ?? undefined,
            storageLocation,
            expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : undefined,
            archivedAt: null,
            lastSyncedAt: new Date(),
          },
        });

        if (existing) updated += 1;
        else created += 1;
      }

      const stale = await this.prisma.yliko.updateMany({
        where: {
          topikoId: user.topikoId,
          source: DataSource.OUCHTRACKER,
          archivedAt: null,
          externalId: { notIn: [...seen] },
        },
        data: { archivedAt: new Date() },
      });

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), ok: true, created, updated, skipped: stale.count },
      });

      return { created, updated, archived: stale.count };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), ok: false, error: message },
      });
      this.logger.error(`Αποτυχία συγχρονισμού φαρμακείου: ${message}`);
      throw error;
    }
  }

  /**
   * Συγχρονισμός περιστατικών. Ο ασθενής αντιστοιχίζεται με το μητρώο όταν
   * γίνεται: αν το Ouchtracker δίνει μόνο όνομα, κρατάμε το περιστατικό χωρίς
   * σύνδεση αντί να μαντέψουμε — λάθος αντιστοίχιση σε ιατρικό δεδομένο είναι
   * χειρότερη από καμία.
   */
  async syncIncidents(user: RequestUser) {
    const run = await this.prisma.syncRun.create({
      data: { topikoId: user.topikoId, source: DataSource.OUCHTRACKER },
    });

    try {
      const remote = await this.ouchtracker.incidents();
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const incident of remote) {
        const occurredAt = new Date(incident.createdAt);
        if (Number.isNaN(occurredAt.getTime())) {
          skipped += 1;
          continue;
        }

        const existing = await this.prisma.incident.findUnique({
          where: { topikoId_externalId: { topikoId: user.topikoId, externalId: incident.id } },
          select: { id: true },
        });

        // Το Ouchtracker δεν κρατά ασθενή/θεραπεία/σοβαρότητα — μόνο περιγραφή και
        // είδη που καταναλώθηκαν. Φτιάχνουμε περίληψη από αυτά.
        const consumed = incident.items
          .map((it) => `${it.name}${it.quantityUsed ? ` ×${it.quantityUsed}` : ''}`)
          .join(', ');
        const summary =
          [incident.description, consumed && `Χρησιμοποιήθηκαν: ${consumed}`].filter(Boolean).join(' · ') ||
          'Περιστατικό φαρμακείου';

        await this.prisma.incident.upsert({
          where: { topikoId_externalId: { topikoId: user.topikoId, externalId: incident.id } },
          create: {
            topikoId: user.topikoId,
            externalId: incident.id,
            occurredAt,
            summary,
            lastSyncedAt: new Date(),
          },
          update: {
            occurredAt,
            summary,
            lastSyncedAt: new Date(),
          },
        });

        if (existing) updated += 1;
        else created += 1;
      }

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), ok: true, created, updated, skipped },
      });

      return { created, updated, skipped };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), ok: false, error: message },
      });
      throw error;
    }
  }
}
