import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DrasiStatus } from '@prisma/client';
import { COLLAB_FIELDS, ITEM_DOC, MEAL_DOC, drasiCan, drasiEditScope, type DrasiPerm } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { textDocument, type CollabAccess, type CollabDocumentType } from '../collab/collab-documents';
import { projectedText } from '../collab/collab-fields';
import { CollabService } from '../collab/collab.service';
import { DrasiAccessService } from './drasi-access.service';
import { isMeal } from './diatrofologio';
import { normalizeItem, normalizeMeal, readItem, readMeal, seedItem, seedMeal, upgradeItem, upgradeMeal } from './drasi-docs';

/**
 * Τα κοινά έγγραφα μιας δράσης (βλ. docs/synergasia.md): περιγραφή, μύθος, lore
 * των ρόλων, στοιχεία του ωρολογίου (προγραμματικό, χώρος, υλικό), γεύματα
 * (συνταγή, μενού, ποσολόγιο). Ένα έγγραφο ανά οντότητα, με τους κανόνες
 * που ισχύουν ήδη στα endpoints τους — ρόλος στο αρχηγείο (`drasiAccess`), «το
 * δικό του» (υπεύθυνος στοιχείου, στέλεχος που παίζει τον ρόλο), κλειστή δράση.
 */
@Injectable()
export class DrasiCollab implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly collab: CollabService,
  ) {}

  onModuleInit(): void {
    for (const type of this.types()) this.collab.registry.register(type);
  }

  /**
   * Βλέπει όποιος βλέπει την ενότητα· γράφει όποιος την αλλάζει — ή, όπου υπάρχει,
   * όποιος έχει «το δικό του» κομμάτι. Κλειστή ή αρχειοθετημένη δράση: μόνο ανάγνωση.
   */
  private async scope(
    user: RequestUser,
    drasiId: string,
    perms: { view: DrasiPerm; edit: DrasiPerm },
    own: () => Promise<boolean> = async () => false,
  ): Promise<CollabAccess | null> {
    const access = await this.access.accessFor(user, drasiId).catch(() => null);
    if (!access || !drasiCan(access, perms.view)) return null;
    const drasi = await this.prisma.drasi.findUnique({ where: { id: drasiId }, select: { status: true, archivedAt: true } });
    if (!drasi) return null;
    if (drasi.archivedAt || drasi.status === DrasiStatus.KLEISTI) return 'read';
    return drasiEditScope(access, perms.edit, await own()) === 'none' ? 'read' : 'write';
  }

  private types(): CollabDocumentType[] {
    const prisma = this.prisma;
    const specs: Parameters<typeof textDocument>[0][] = [
      {
        kind: 'drasi:settings',
        arity: 1,
        fields: COLLAB_FIELDS.drasiSettings,
        access: (user, [drasiId]) => this.scope(user, drasiId!, { view: 'episkopisi', edit: 'rythmiseis' }),
        load: async ([drasiId]) => {
          const drasi = await prisma.drasi.findUnique({ where: { id: drasiId }, select: { description: true } });
          return drasi ? { description: drasi.description ?? '' } : null;
        },
        save: async ([drasiId], values) => {
          await prisma.drasi.updateMany({ where: { id: drasiId }, data: { description: projectedText(values.description) } });
        },
      },
      {
        kind: 'drasi:mythos',
        arity: 1,
        fields: COLLAB_FIELDS.drasiMythos,
        access: (user, [drasiId]) => this.scope(user, drasiId!, { view: 'mythos', edit: 'mythos' }),
        load: async ([drasiId]) => {
          const drasi = await prisma.drasi.findUnique({ where: { id: drasiId }, select: { mythosText: true } });
          return drasi ? { text: drasi.mythosText ?? '' } : null;
        },
        save: async ([drasiId], values) => {
          await prisma.drasi.updateMany({ where: { id: drasiId }, data: { mythosText: projectedText(values.text) } });
        },
      },
      {
        kind: 'drasi:character',
        arity: 2,
        fields: COLLAB_FIELDS.drasiCharacter,
        access: async (user, [drasiId, characterId]) => {
          const character = await prisma.drasiCharacter.findFirst({
            where: { id: characterId, drasiId },
            select: { participant: { select: { userId: true } } },
          });
          if (!character) return null;
          // Το στέλεχος που παίζει τον ρόλο γράφει το lore του (`CHARACTER_OWN_FIELDS`).
          return this.scope(user, drasiId!, { view: 'mythos', edit: 'mythos' }, async () => character.participant?.userId === user.id);
        },
        load: async ([drasiId, characterId]) => {
          const character = await prisma.drasiCharacter.findFirst({ where: { id: characterId, drasiId }, select: { lore: true } });
          return character ? { lore: character.lore ?? '' } : null;
        },
        save: async ([drasiId, characterId], values) => {
          await prisma.drasiCharacter.updateMany({ where: { id: characterId, drasiId }, data: { lore: projectedText(values.lore) } });
        },
      },
    ];
    return [...specs.map(textDocument), this.itemType(), this.mealType()];
  }

  /**
   * Το στοιχείο του ωρολογίου (`ITEM_DOC`): προγραμματικό, χώρος και υλικό. Το
   * Πρόγραμμα, και οι υπεύθυνοι του στοιχείου (`SCHEDULE_ITEM_OWN_FIELDS`).
   */
  private itemType(): CollabDocumentType {
    const prisma = this.prisma;
    const load = (drasiId: string, itemId: string) =>
      prisma.drasiScheduleItem.findFirst({
        where: { id: itemId, drasiId },
        select: {
          description: true,
          location: true,
          yliko: { orderBy: { order: 'asc' }, select: { id: true, order: true, label: true, qty: true, packed: true } },
        },
      });
    return {
      kind: 'drasi:item',
      arity: 2,
      schema: ITEM_DOC.schema,
      access: async (user, [drasiId, itemId]) => {
        const item = await prisma.drasiScheduleItem.findFirst({
          where: { id: itemId, drasiId },
          select: { assignees: { select: { userId: true } } },
        });
        if (!item) return null;
        return this.scope(user, drasiId!, { view: 'programma', edit: 'programma' }, async () =>
          item.assignees.some((a) => a.userId === user.id),
        );
      },
      seed: async (doc, [drasiId, itemId]) => {
        const item = await load(drasiId!, itemId!);
        if (item) seedItem(doc, item);
        return Boolean(item);
      },
      upgrade: async (doc, [drasiId, itemId]) => {
        const item = await load(drasiId!, itemId!);
        if (item) upgradeItem(doc, item);
        return Boolean(item);
      },
      project: async (doc, [drasiId, itemId]) => {
        const write = normalizeItem(readItem(doc));
        await prisma.$transaction(async (tx) => {
          const { count } = await tx.drasiScheduleItem.updateMany({
            where: { id: itemId, drasiId },
            data: { description: write.description, location: write.location },
          });
          if (!count) return;
          // Ίδια id με το έγγραφο: η λίστα ξαναγράφεται, οι γραμμές κρατούν την ταυτότητά τους.
          await tx.drasiScheduleYlikoItem.deleteMany({ where: { itemId } });
          if (write.yliko.length) {
            await tx.drasiScheduleYlikoItem.createMany({ data: write.yliko.map((y) => ({ ...y, itemId: itemId! })) });
          }
        });
      },
    };
  }

  /**
   * Το γεύμα (`MEAL_DOC`): συνταγή, μενού και ποσολόγιο — μόνο ό,τι είναι γεύμα
   * (είδος «Γεύμα» ή ετικέτα κολατσιού). Μαγείρισσα και τροφοδοσία.
   */
  private mealType(): CollabDocumentType {
    const prisma = this.prisma;
    const load = async (drasiId: string, itemId: string) => {
      const item = await prisma.drasiScheduleItem.findFirst({
        where: { id: itemId, drasiId },
        select: {
          kind: true,
          snack: true,
          meal: {
            select: {
              recipe: true,
              menu: true,
              ingredients: { orderBy: { order: 'asc' }, select: { id: true, order: true, label: true, qty: true, bought: true } },
            },
          },
        },
      });
      if (!item || !isMeal(item)) return null;
      return { recipe: item.meal?.recipe ?? null, menu: item.meal?.menu ?? null, ingredients: item.meal?.ingredients ?? [] };
    };
    return {
      kind: 'drasi:meal',
      arity: 2,
      schema: MEAL_DOC.schema,
      access: async (user, [drasiId, itemId]) => {
        const item = await prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId }, select: { kind: true, snack: true } });
        if (!item || !isMeal(item)) return null;
        return this.scope(user, drasiId!, { view: 'diatrofologio', edit: 'diatrofologio' });
      },
      seed: async (doc, [drasiId, itemId]) => {
        const meal = await load(drasiId!, itemId!);
        if (meal) seedMeal(doc, meal);
        return Boolean(meal);
      },
      upgrade: async (doc, [drasiId, itemId]) => {
        const meal = await load(drasiId!, itemId!);
        if (meal) upgradeMeal(doc, meal);
        return Boolean(meal);
      },
      project: async (doc, [drasiId, itemId]) => {
        const write = normalizeMeal(readMeal(doc));
        await prisma.$transaction(async (tx) => {
          if (!(await tx.drasiScheduleItem.count({ where: { id: itemId, drasiId } }))) return;
          await tx.drasiMeal.upsert({
            where: { itemId },
            create: { itemId: itemId!, recipe: write.recipe, menu: write.menu },
            update: { recipe: write.recipe, menu: write.menu },
          });
          await tx.drasiMealIngredient.deleteMany({ where: { itemId } });
          if (write.ingredients.length) {
            await tx.drasiMealIngredient.createMany({ data: write.ingredients.map((y) => ({ ...y, itemId: itemId! })) });
          }
        });
      },
    };
  }
}
