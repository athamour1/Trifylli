import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckoutStatus, Prisma } from '@prisma/client';
import {
  BLOCKING_CHECKOUT_STATUSES,
  KLADOS_LABEL,
  RETURN_CONDITION_LABEL,
  type CheckoutConflict,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { assertKladosAccess } from '../../common/util/klados-scope';
import { blockingReservations, peakReserved, type Interval } from './availability';
import type { CreateCheckoutDto, ReturnCheckoutDto } from './dto/yliko.dto';

/**
 * Δεσμεύσεις υλικού.
 *
 * Ο έλεγχος διαθεσιμότητας και η εγγραφή γίνονται μέσα σε **μία** συναλλαγή με
 * `Serializable` isolation. Χωρίς αυτό, δύο στελέχη που δεσμεύουν την ίδια σκηνή
 * ταυτόχρονα περνούν και τα δύο τον έλεγχο (race condition) — ακριβώς η
 * διπλοκράτηση που το σύστημα υπάρχει για να αποτρέψει.
 */
@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: RequestUser, dto: CreateCheckoutDto) {
    if (dto.from >= dto.to) {
      throw new BadRequestException('Η έναρξη της δέσμευσης πρέπει να προηγείται της λήξης.');
    }
    if (dto.kladosType) assertKladosAccess(user, dto.kladosType);

    const window: Interval = { from: dto.from, to: dto.to };

    return this.prisma.$transaction(
      async (tx) => {
        const yliko = await tx.yliko.findFirst({
          where: { id: dto.ylikoId, topikoId: user.topikoId, archivedAt: null },
          include: { klados: { select: { type: true } } },
        });
        if (!yliko) throw new NotFoundException('Το υλικό δεν βρέθηκε.');

        // Υλικό που ανήκει σε κλάδο δεν δεσμεύεται από άλλο κλάδο χωρίς εμβέλεια
        // Τοπικού — η κεντρική αποθήκη (kladosId = null) είναι ανοιχτή σε όλους.
        if (yliko.klados?.type) {
          assertKladosAccess(user, yliko.klados.type as KladosType);
        }

        const existing = await tx.ylikoCheckout.findMany({
          where: {
            ylikoId: dto.ylikoId,
            status: { in: [...BLOCKING_CHECKOUT_STATUSES] },
            from: { lt: dto.to },
            to: { gt: dto.from },
          },
          include: {
            klados: { select: { type: true } },
            drasi: { select: { title: true, klados: { select: { type: true } } } },
            syggentrwsh: { select: { date: true, klados: { select: { type: true } } } },
          },
        });

        const peak = peakReserved(existing, window);
        const available = yliko.totalQty - peak;

        if (dto.qty > available) {
          throw new ConflictException(this.describeConflict(yliko, dto, available, existing, window));
        }

        const kladosId = await this.resolveKladosId(tx, user, dto);

        const checkout = await tx.ylikoCheckout.create({
          data: {
            ylikoId: dto.ylikoId,
            kladosId,
            drasiId: dto.drasiId,
            syggentrwshId: dto.syggentrwshId,
            requestedById: user.id,
            qty: dto.qty,
            from: dto.from,
            to: dto.to,
            note: dto.note,
            status: CheckoutStatus.DESMEFSI,
          },
        });

        return checkout;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Παραλαβή: το υλικό φεύγει φυσικά από την αποθήκη. */
  async pickUp(user: RequestUser, id: string) {
    const checkout = await this.load(user, id);
    if (checkout.status !== CheckoutStatus.DESMEFSI) {
      throw new BadRequestException(`Η δέσμευση είναι σε κατάσταση ${checkout.status}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ylikoCheckout.update({
        where: { id },
        data: { status: CheckoutStatus.PARALAVI },
      });

      // Τα αναλώσιμα δεν επιστρέφουν: η παραλαβή μειώνει μόνιμα το απόθεμα και
      // η δέσμευση κλείνει αμέσως, αλλιώς θα δέσμευε ποσότητα που δεν υπάρχει.
      const yliko = await tx.yliko.findUniqueOrThrow({ where: { id: checkout.ylikoId } });
      if (yliko.consumable) {
        await tx.yliko.update({
          where: { id: yliko.id },
          data: { totalQty: Math.max(0, yliko.totalQty - checkout.qty) },
        });
        return tx.ylikoCheckout.update({
          where: { id },
          data: { status: CheckoutStatus.EPISTROFI, returnedQty: 0, note: 'Αναλώσιμο — αφαιρέθηκε από το απόθεμα.' },
        });
      }

      return updated;
    });
  }

  async returnItem(user: RequestUser, id: string, dto: ReturnCheckoutDto) {
    const checkout = await this.load(user, id);
    if (checkout.status === CheckoutStatus.EPISTROFI) {
      throw new BadRequestException('Η δέσμευση έχει ήδη κλείσει.');
    }

    const returnedQty = dto.returnedQty ?? checkout.qty;
    if (returnedQty > checkout.qty) {
      throw new BadRequestException(`Δεν μπορούν να επιστραφούν ${returnedQty} από ${checkout.qty} τεμάχια.`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Απώλεια/φθορά: το απόθεμα του Τοπικού πραγματικά μειώθηκε.
      const lost = checkout.qty - returnedQty;
      if (lost > 0) {
        const yliko = await tx.yliko.findUniqueOrThrow({ where: { id: checkout.ylikoId } });
        await tx.yliko.update({
          where: { id: yliko.id },
          data: { totalQty: Math.max(0, yliko.totalQty - lost) },
        });
      }

      // Φθορά/βλάβη/απώλεια κατά την επιστροφή → αυτόματη σημείωση στο ιστορικό
      // συντήρησης, για να μη χαθεί η πληροφορία.
      const condition = dto.condition;
      if ((condition && condition !== 'KALI') || lost > 0) {
        const parts = [
          condition ? RETURN_CONDITION_LABEL[condition] : 'Φθορά',
          lost > 0 ? `απώλεια ${lost} τεμ.` : null,
          dto.note || null,
        ].filter(Boolean);
        await tx.ylikoMaintenance.create({
          data: {
            ylikoId: checkout.ylikoId,
            kind: 'DAMAGE',
            note: `Από επιστροφή: ${parts.join(' — ')}`,
            date: new Date(),
            createdById: user.id,
          },
        });
      }

      return tx.ylikoCheckout.update({
        where: { id },
        data: {
          status: CheckoutStatus.EPISTROFI,
          returnedQty,
          returnCondition: condition ?? null,
          note: dto.note ?? checkout.note,
        },
      });
    });
  }

  async cancel(user: RequestUser, id: string) {
    const checkout = await this.load(user, id);
    if (checkout.status === CheckoutStatus.PARALAVI) {
      throw new BadRequestException('Το υλικό έχει παραληφθεί — δηλώστε επιστροφή αντί ακύρωσης.');
    }
    return this.prisma.ylikoCheckout.update({
      where: { id },
      data: { status: CheckoutStatus.AKYROSI },
    });
  }

  /** Οι δεσμεύσεις μιας δράσης — «τι υλικό έχουν πάρει». */
  async listForDrasi(user: RequestUser, drasiId: string) {
    const drasi = await this.prisma.drasi.findFirst({
      where: { id: drasiId, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!drasi) throw new NotFoundException('Η δράση δεν βρέθηκε.');
    assertKladosAccess(user, drasi.klados?.type as KladosType | undefined);

    return this.prisma.ylikoCheckout.findMany({
      where: { drasiId, status: { not: CheckoutStatus.AKYROSI } },
      include: {
        yliko: { select: { id: true, name: true, category: true, unit: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async load(user: RequestUser, id: string) {
    const checkout = await this.prisma.ylikoCheckout.findFirst({
      where: { id, yliko: { topikoId: user.topikoId } },
    });
    if (!checkout) throw new NotFoundException('Η δέσμευση δεν βρέθηκε.');
    return checkout;
  }

  private async resolveKladosId(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    dto: CreateCheckoutDto,
  ): Promise<string | null> {
    if (dto.kladosType) {
      const klados = await tx.klados.findUnique({
        where: { topikoId_type: { topikoId: user.topikoId, type: dto.kladosType } },
        select: { id: true },
      });
      return klados?.id ?? null;
    }
    // Χωρίς ρητό κλάδο, τον συμπεραίνουμε από τη δράση ή τη συγκέντρωση.
    if (dto.syggentrwshId) {
      const s = await tx.syggentrwsh.findUnique({
        where: { id: dto.syggentrwshId },
        select: { kladosId: true },
      });
      return s?.kladosId ?? null;
    }
    if (dto.drasiId) {
      const d = await tx.drasi.findUnique({ where: { id: dto.drasiId }, select: { kladosId: true } });
      return d?.kladosId ?? null;
    }
    return null;
  }

  /** Χτίζει εξηγήσιμο μήνυμα σύγκρουσης: ποιος κρατά τι, για να ξέρεις σε ποιον να μιλήσεις. */
  private describeConflict(
    yliko: { id: string; name: string; totalQty: number },
    dto: CreateCheckoutDto,
    available: number,
    existing: Array<{
      qty: number;
      from: Date;
      to: Date;
      status: CheckoutStatus;
      klados: { type: string } | null;
      drasi: { title: string; klados: { type: string } | null } | null;
      syggentrwsh: { date: Date; klados: { type: string } | null } | null;
    }>,
    window: Interval,
  ): CheckoutConflict & { message: string } {
    const blocking = blockingReservations(existing, window).map((c) => {
      // Ο κλάδος της ίδιας της δέσμευσης προηγείται: σε δράση Τοπικού κάθε
      // κλάδος δεσμεύει χωριστά και «Τοπικό» δεν λέει σε ποιον να μιλήσεις.
      const kladosType = (c.klados?.type ??
        c.drasi?.klados?.type ??
        c.syggentrwsh?.klados?.type ??
        null) as KladosType | null;
      const label =
        c.drasi?.title ??
        (c.syggentrwsh ? `Συγκέντρωση ${c.syggentrwsh.date.toLocaleDateString('el-GR')}` : 'Δέσμευση');
      return {
        kladosType,
        label: kladosType ? `${label} — ${KLADOS_LABEL[kladosType]}` : label,
        qty: c.qty,
        status: c.status,
      };
    });

    return {
      ylikoId: yliko.id,
      name: yliko.name,
      requestedQty: dto.qty,
      availableQty: Math.max(0, available),
      blockedBy: blocking,
      message:
        `Ζητήθηκαν ${dto.qty} × «${yliko.name}» αλλά είναι διαθέσιμα ${Math.max(0, available)} ` +
        `από ${yliko.totalQty} για το διάστημα που επιλέξατε.`,
    };
  }
}
