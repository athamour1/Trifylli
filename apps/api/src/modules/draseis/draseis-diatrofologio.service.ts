import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { COLLAB_FIELDS, type DrasiDiatrofologioView, type DrasiMealSummary, type DrasiMealView, type DrasiScheduleItemView } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { refuseCollabFields } from '../collab/collab-fields';
import { DrasiAccessService } from './drasi-access.service';
import { DraseisPlanService } from './draseis-plan.service';
import { isMeal } from './diatrofologio';
import type { UpdateMealDto } from './dto/drasi-diatrofologio.dto';

/**
 * Το διατροφολόγιο μιας δράσης. Τα γεύματα δεν είναι δικά του: είναι τα στοιχεία
 * του ωρολογίου με είδος «Γεύμα» ή ετικέτα κολατσιού (βλ. `isMeal`), με τις ώρες
 * που βγάζει το πρόγραμμα. Εδώ ζει μόνο ό,τι προσθέτει η κουζίνα: τι τρώμε, η
 * συνταγή και το ποσολόγιο.
 */
@Injectable()
export class DraseisDiatrofologioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly plan: DraseisPlanService,
  ) {}

  /** Όλες οι ημέρες του προγράμματος, με τα γεύματά τους. */
  async view(user: RequestUser, id: string): Promise<DrasiDiatrofologioView> {
    const schedule = await this.plan.scheduleView(user, id);
    const ids = schedule.days.flatMap((d) => d.items).filter(isMeal).map((i) => i.id);
    const meals = await this.prisma.drasiMeal.findMany({
      where: { itemId: { in: ids } },
      include: { ingredients: { select: { bought: true } } },
    });
    const byItem = new Map(meals.map((m) => [m.itemId, m]));
    return {
      days: schedule.days.map((d) => ({
        date: d.date,
        meals: d.items.filter(isMeal).map((i) => toSummary(i, byItem.get(i.id))),
      })),
    };
  }

  async meal(user: RequestUser, id: string, itemId: string): Promise<DrasiMealView> {
    const item = await this.mealItem(user, id, itemId);
    const meal = await this.prisma.drasiMeal.findUnique({
      where: { itemId },
      include: { ingredients: { orderBy: { order: 'asc' } } },
    });
    return {
      itemId: item.id,
      date: item.date,
      title: item.title,
      kind: item.kind,
      snack: item.snack,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      menu: meal?.menu ?? null,
      recipe: meal?.recipe ?? null,
      ingredients: (meal?.ingredients ?? []).map((y) => ({ id: y.id, label: y.label, qty: y.qty, bought: y.bought })),
    };
  }

  /**
   * Συνταγή, μενού και ποσολόγιο γράφονται πια μαζί (`drasi:<id>:meal:<id>`): ένα
   * tab από πριν που στέλνει ολόκληρη τη φόρμα παίρνει 409 «ανανέωσε».
   */
  async updateMeal(user: RequestUser, id: string, itemId: string, dto: UpdateMealDto): Promise<DrasiMealView> {
    refuseCollabFields(dto, COLLAB_FIELDS.drasiMeal);
    await this.access.load(user, id, 'write');
    return this.meal(user, id, itemId);
  }

  /** Το στοιχείο του ωρολογίου με τις ώρες του — μόνο αν είναι γεύμα. */
  private async mealItem(user: RequestUser, id: string, itemId: string): Promise<DrasiScheduleItemView> {
    const item = (await this.plan.schedule(user, id)).find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Το στοιχείο του ωρολογίου δεν βρέθηκε.');
    if (!isMeal(item)) throw new BadRequestException('Δεν είναι γεύμα — βάλε στο πρόγραμμα είδος «Γεύμα» ή ετικέτα κολατσιού.');
    return item;
  }
}

function toSummary(
  item: DrasiScheduleItemView,
  meal: { menu: string | null; recipe: string | null; ingredients: { bought: boolean }[] } | undefined,
): DrasiMealSummary {
  return {
    itemId: item.id,
    title: item.title,
    kind: item.kind,
    snack: item.snack,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    menu: meal?.menu ?? null,
    hasRecipe: Boolean(meal?.recipe),
    ingredients: meal?.ingredients.length ?? 0,
    bought: meal?.ingredients.filter((y) => y.bought).length ?? 0,
  };
}
