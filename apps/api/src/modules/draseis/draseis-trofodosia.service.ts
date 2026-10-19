import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  collabColor,
  collabDocument,
  collabShortName,
  drasiCan,
  type DrasiFoodPurchaseView,
  type DrasiTrofodosiaView,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { CollabService } from '../collab/collab.service';
import { isMeal } from './diatrofologio';
import { DrasiAccessService } from './drasi-access.service';
import { tickMealIngredient } from './drasi-docs';
import { DraseisPlanService } from './draseis-plan.service';
import type { CreateFoodPurchaseDto, UpdateFoodPurchaseDto } from './dto/drasi-trofodosia.dto';

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;
const PURCHASE_INCLUDE = { requestedBy: PERSON, boughtBy: PERSON } as const;
type PurchaseRow = Prisma.DrasiFoodPurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

/**
 * Η Τροφοδοσία: τι πρέπει να αγοραστεί κάθε ημέρα της δράσης. Δύο πηγές, μία
 * λίστα: τα υλικά των γευμάτων της ημέρας (από το ποσολόγιο του καθενός — το
 * «αγοράστηκε» είναι το ίδιο με εκείνο) και όσα ζητούν επιπλέον λειτουργία,
 * πρόγραμμα, αρχηγός, μαγείρισσα και τροφοδοσία. «Αγοράστηκε» σημειώνουν η
 * τροφοδοσία και ο αρχηγός (perm `purchase`, στο guard). Χωρίς ταμείο: την
 * απόδειξη την περνά ο ταμίας όπως πάντα.
 */
@Injectable()
export class DraseisTrofodosiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly plan: DraseisPlanService,
    private readonly collab: CollabService,
  ) {}

  async view(user: RequestUser, id: string): Promise<DrasiTrofodosiaView> {
    // Και τα ποσολόγια που γράφονται αυτή τη στιγμή: το `scheduleView` τα σώζει πρώτα.
    const schedule = await this.plan.scheduleView(user, id);
    const mealIds = schedule.days.flatMap((d) => d.items).filter(isMeal).map((i) => i.id);
    const [meals, extras] = await Promise.all([
      this.prisma.drasiMeal.findMany({ where: { itemId: { in: mealIds } }, include: { ingredients: { orderBy: { order: 'asc' } } } }),
      this.prisma.drasiFoodPurchase.findMany({ where: { drasiId: id }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], include: PURCHASE_INCLUDE }),
    ]);
    // Ποιος αγόρασε ένα υλικό γεύματος: id από το κοινό έγγραφο (χωρίς FK).
    const buyerIds = [...new Set(meals.flatMap((m) => m.ingredients.map((y) => y.boughtById)).filter((v): v is string => !!v))];
    const buyers = new Map((await this.prisma.user.findMany({ where: { id: { in: buyerIds } }, ...PERSON })).map((u) => [u.id, u]));
    const byItem = new Map(meals.map((m) => [m.itemId, m]));
    const itemsByDate = new Map(schedule.days.map((d) => [d.date, d.items]));
    const dates = [...new Set([...schedule.days.map((d) => d.date), ...extras.map((e) => dayKey(e.date))])].sort();

    return {
      days: dates.map((date) => ({
        date,
        meals: (itemsByDate.get(date) ?? []).filter(isMeal).map((item) => ({
          itemId: item.id,
          title: item.title,
          kind: item.kind,
          snack: item.snack,
          startsAt: item.startsAt,
          ingredients: (byItem.get(item.id)?.ingredients ?? [])
            .filter((y) => y.label.trim())
            .map((y) => ({
              id: y.id,
              label: y.label,
              qty: y.qty,
              bought: y.bought,
              boughtBy: (y.boughtById && buyers.get(y.boughtById)) || null,
              boughtAt: y.boughtAt?.toISOString() ?? null,
            })),
        })),
        extras: extras.filter((e) => dayKey(e.date) === date).map(toView),
      })),
    };
  }

  async add(user: RequestUser, id: string, dto: CreateFoodPurchaseDto): Promise<DrasiFoodPurchaseView> {
    await this.access.load(user, id, 'write');
    await this.assertDay(user, id, dto.date);
    const row = await this.prisma.drasiFoodPurchase.create({
      data: {
        drasiId: id,
        date: dateColumn(dto.date),
        label: dto.label.trim(),
        qty: dto.qty?.trim() ?? '',
        note: dto.note?.trim() || null,
        requestedById: user.id,
      },
      include: PURCHASE_INCLUDE,
    });
    return toView(row);
  }

  /** Ό,τι αγοράστηκε δεν αλλάζει — ξε-τικ πρώτα. */
  async update(user: RequestUser, id: string, purchaseId: string, dto: UpdateFoodPurchaseDto): Promise<DrasiFoodPurchaseView> {
    await this.access.load(user, id, 'write');
    const row = await this.find(id, purchaseId);
    if (row.boughtAt) throw new ConflictException('Αγοράστηκε ήδη — δεν αλλάζει.');
    if (dto.date) await this.assertDay(user, id, dto.date);
    const updated = await this.prisma.drasiFoodPurchase.update({
      where: { id: purchaseId },
      data: {
        ...(dto.date ? { date: dateColumn(dto.date) } : {}),
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.qty !== undefined ? { qty: dto.qty.trim() } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      },
      include: PURCHASE_INCLUDE,
    });
    return toView(updated);
  }

  /** Όσα δεν αγοράστηκαν τα σβήνει όποιος προσθέτει· ό,τι αγοράστηκε, μόνο όποιος αγοράζει. */
  async remove(user: RequestUser, id: string, purchaseId: string): Promise<{ deleted: true }> {
    await this.access.load(user, id, 'write');
    const row = await this.find(id, purchaseId);
    if (row.boughtAt && !(await this.canPurchase(user, id))) {
      throw new ForbiddenException('Ό,τι αγοράστηκε το σβήνει η τροφοδοσία ή ο αρχηγός.');
    }
    await this.prisma.drasiFoodPurchase.delete({ where: { id: purchaseId } });
    return { deleted: true };
  }

  async setBought(user: RequestUser, id: string, purchaseId: string, bought: boolean): Promise<DrasiFoodPurchaseView> {
    await this.access.load(user, id, 'write');
    await this.find(id, purchaseId);
    const updated = await this.prisma.drasiFoodPurchase.update({
      where: { id: purchaseId },
      data: bought ? { boughtAt: new Date(), boughtById: user.id } : { boughtAt: null, boughtById: null },
      include: PURCHASE_INCLUDE,
    });
    return toView(updated);
  }

  /**
   * «Αγοράστηκε» ενός υλικού γεύματος: γράφεται στο κοινό έγγραφο του γεύματος,
   * όπως από τη σελίδα του — όσοι το έχουν ανοιχτό το βλέπουν αμέσως, και η βάση
   * ενημερώνεται από την προβολή του εγγράφου.
   */
  async setIngredientBought(user: RequestUser, id: string, itemId: string, ingredientId: string, bought: boolean): Promise<{ bought: boolean }> {
    await this.access.load(user, id, 'write');
    const item = await this.prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId: id }, select: { kind: true, snack: true } });
    if (!item || !isMeal(item)) throw new NotFoundException('Το γεύμα δεν βρέθηκε.');
    const connection = await this.collab.hocuspocus.openDirectConnection(collabDocument.drasiMeal(id, itemId), {
      requestId: 'trofodosia',
      userId: user.id,
      user: { id: user.id, name: collabShortName(user.firstName, user.lastName), fullName: `${user.firstName} ${user.lastName}`, color: collabColor(user.id) },
    });
    let found = false;
    try {
      await connection.transact((doc) => {
        found = tickMealIngredient(doc, ingredientId, bought, user.id);
      });
    } finally {
      await connection.disconnect();
    }
    if (!found) throw new NotFoundException('Το υλικό δεν υπάρχει πια στο ποσολόγιο του γεύματος.');
    return { bought };
  }

  private async find(drasiId: string, purchaseId: string): Promise<PurchaseRow> {
    const row = await this.prisma.drasiFoodPurchase.findFirst({ where: { id: purchaseId, drasiId }, include: PURCHASE_INCLUDE });
    if (!row) throw new NotFoundException('Δεν βρέθηκε στη λίστα της τροφοδοσίας.');
    return row;
  }

  /** Μόνο ημέρες της δράσης — όπως στο ωρολόγιο. */
  private async assertDay(user: RequestUser, id: string, date: string): Promise<void> {
    const { days } = await this.plan.scheduleView(user, id);
    if (!days.some((d) => d.date === date)) throw new BadRequestException('Η ημέρα δεν είναι μέσα στη δράση.');
  }

  private async canPurchase(user: RequestUser, id: string): Promise<boolean> {
    const access = user.drasiGrant?.drasiId === id ? user.drasiGrant.access : await this.access.accessFor(user, id);
    return drasiCan(access, 'purchase', 'edit');
  }
}

function toView(r: PurchaseRow): DrasiFoodPurchaseView {
  return {
    id: r.id,
    date: dayKey(r.date),
    label: r.label,
    qty: r.qty,
    note: r.note,
    requestedBy: r.requestedBy,
    bought: r.boughtAt !== null,
    boughtBy: r.boughtBy,
    boughtAt: r.boughtAt?.toISOString() ?? null,
  };
}

/** Η στήλη `@db.Date`: μεσάνυχτα UTC της ημέρας. */
function dateColumn(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00Z`);
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
