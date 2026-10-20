import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DrasiFormStatus, DrasiFormType, Prisma } from '@prisma/client';
import { COLLAB_FIELDS, canSeeFoodNeeds, type DrasiFoodNeedsView, type KladosType, type DrasiDiatrofologioView, type DrasiMealSummary, type DrasiMealView, type DrasiScheduleItemView } from '@trifylli/shared';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { refuseCollabFields } from '../collab/collab-fields';
import { DrasiAccessService } from './drasi-access.service';
import { DraseisPlanService } from './draseis-plan.service';
import { isMeal } from './diatrofologio';
import { foodNeedsOf } from './food-needs';
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
    private readonly audit: AuditService,
  ) {}

  /** Αλλεργίες & διατροφή από τις υποβληθείσες δηλώσεις υγείας (F16). Καταγράφεται. */
  async foodNeeds(user: RequestUser, id: string): Promise<DrasiFoodNeedsView> {
    const access = user.drasiGrant?.drasiId === id ? user.drasiGrant.access : await this.access.accessFor(user, id);
    if (!canSeeFoodNeeds(access)) {
      throw new ForbiddenException('Τις αλλεργίες τις βλέπουν όσοι γράφουν στο διατροφολόγιο και το φαρμακείο της δράσης.');
    }
    const [expected, forms] = await Promise.all([
      this.prisma.drasiParticipant.count({ where: { drasiId: id } }),
      this.prisma.drasiForm.findMany({
        where: { drasiId: id, type: DrasiFormType.YGEIA, status: DrasiFormStatus.SUBMITTED, data: { not: Prisma.DbNull } },
        select: {
          participantId: true,
          data: true,
          participant: {
            select: {
              user: { select: { firstName: true, lastName: true, memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } } } },
              groups: { select: { group: { select: { kind: true, name: true } } } },
            },
          },
        },
        orderBy: { participant: { user: { lastName: 'asc' } } },
      }),
    ]);
    await this.audit.record(user, 'drasi.food.read', 'drasi', id, { count: forms.length });
    const people = forms.flatMap((f) => {
      const needs = foodNeedsOf((f.data as Record<string, unknown> | null) ?? {});
      if (!needs.allergies && !needs.diet) return [];
      const u = f.participant.user;
      return [
        {
          participantId: f.participantId,
          firstName: u.firstName,
          lastName: u.lastName,
          kladosType: (u.memberships[0]?.klados.type as KladosType | undefined) ?? null,
          group: f.participant.groups.find((g) => g.group.kind !== 'SKINI')?.group.name ?? null,
          ...needs,
        },
      ];
    });
    return { submitted: forms.length, expected, people };
  }

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
