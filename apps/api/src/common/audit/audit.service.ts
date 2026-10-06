import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/types';

/**
 * Ίχνος ευαίσθητων ενεργειών: ποιος, τι, σε ποια εγγραφή, πότε.
 *
 * Δεν είναι debugging log — είναι απάντηση στο «ποιος έσβησε την απόδειξη» και
 * «πότε πήρε πρόσβαση ο Χ», ερωτήσεις που σε ένα Τοπικό με χρήματα και
 * προσωπικά δεδομένα παιδιών τίθενται αργά ή γρήγορα. Γι' αυτό καταγράφει
 * **αλλαγές**, όχι αναγνώσεις, και δεν σβήνεται ποτέ από την εφαρμογή.
 *
 * Η εγγραφή γίνεται best-effort: ένα σφάλμα στο audit δεν ακυρώνει την ενέργεια
 * που ήδη έγινε — θα ήταν χειρότερο να μείνει η πράξη μισή απ' ό,τι ανεξήγητη.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    actor: RequestUser,
    action: string,
    entity: string,
    entityId: string | null | undefined,
    diff?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          topikoId: actor.topikoId,
          actorId: actor.id,
          action,
          entity,
          entityId: entityId ?? null,
          diff: (diff ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Αποτυχία audit (${action} ${entity}/${entityId ?? '-'}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
