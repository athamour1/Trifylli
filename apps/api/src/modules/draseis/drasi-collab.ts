import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DrasiRoleKind, DrasiStatus, MemberKind } from '@prisma/client';
import {
  COLLAB_FIELDS,
  ITEM_DOC,
  MEAL_DOC,
  collabDocument,
  drasiCan,
  drasiEditScope,
  type CommentPerson,
  type DrasiPerm,
} from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { textDocument, type CollabAccess, type CollabDocumentAbout, type CollabDocumentType } from '../collab/collab-documents';
import { projectedText } from '../collab/collab-fields';
import { CollabService } from '../collab/collab.service';
import { DrasiAccessService } from './drasi-access.service';
import { isMeal } from './diatrofologio';
import {
  normalizeItem,
  normalizeMeal,
  presentItem,
  presentMeal,
  readItem,
  readMeal,
  restoreItem,
  restoreMeal,
  seedItem,
  seedMeal,
  upgradeItem,
  upgradeMeal,
} from './drasi-docs';

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

  // ───────────────────────── Για τα σχόλια ─────────────────────────

  /**
   * Τι είναι το έγγραφο στις ειδοποιήσεις των σχολίων: «… — δράση «Κατασκήνωση»»,
   * πού ανοίγει, ποιοι παρακολουθούν, και ότι τα νέα σχόλια μπαίνουν στη ροή της δράσης.
   */
  private async about(
    drasiId: string,
    spec: { where: (drasi: string) => string; link: string; kind: string; watchers: () => Promise<string[]> },
  ): Promise<CollabDocumentAbout | null> {
    const drasi = await this.prisma.drasi.findUnique({ where: { id: drasiId }, select: { title: true } });
    if (!drasi) return null;
    return {
      title: spec.where(`«${drasi.title}»`),
      link: `/draseis/${drasiId}/${spec.link}`,
      watchers: await spec.watchers(),
      activity: { room: collabDocument.drasiRoom(drasiId), topic: `comment:${spec.kind}` },
    };
  }

  /** Όσοι έχουν αυτές τις ευθύνες στο αρχηγείο της δράσης. */
  private async holders(drasiId: string, kinds: DrasiRoleKind[]): Promise<string[]> {
    const rows = await this.prisma.drasiRole.findMany({ where: { drasiId, kind: { in: kinds } }, select: { userId: true } });
    return [...new Set(rows.map((row) => row.userId))];
  }

  /** Οι υπεύθυνοι ενός στοιχείου του ωρολογίου. */
  private async assignees(itemId: string): Promise<string[]> {
    const rows = await this.prisma.drasiScheduleAssignee.findMany({ where: { itemId }, select: { userId: true } });
    return rows.map((row) => row.userId);
  }

  /**
   * Τα στελέχη της δράσης — δικά μας, φιλοξενούμενα, εξωτερικά, και όσοι έχουν
   * ευθύνη στο αρχηγείο. Ποτέ παιδιά: αυτά αναφέρονται με «@» στα σχόλια.
   */
  private async people(drasiId: string): Promise<CommentPerson[]> {
    const person = { select: { id: true, firstName: true, lastName: true } } as const;
    const [participants, roles] = await Promise.all([
      this.prisma.drasiParticipant.findMany({ where: { drasiId, kind: MemberKind.STELEXOS }, select: { user: person } }),
      this.prisma.drasiRole.findMany({ where: { drasiId }, select: { user: person } }),
    ]);
    const byId = new Map<string, CommentPerson>();
    for (const row of [...participants, ...roles]) byId.set(row.user.id, row.user);
    return [...byId.values()].sort((a, b) => a.firstName.localeCompare(b.firstName, 'el') || a.lastName.localeCompare(b.lastName, 'el'));
  }

  private types(): CollabDocumentType[] {
    const prisma = this.prisma;
    const specs: Parameters<typeof textDocument>[0][] = [
      {
        kind: 'drasi:settings',
        arity: 1,
        fields: COLLAB_FIELDS.drasiSettings,
        labels: { description: 'Περιγραφή' },
        access: (user, [drasiId]) => this.scope(user, drasiId!, { view: 'episkopisi', edit: 'rythmiseis' }),
        load: async ([drasiId]) => {
          const drasi = await prisma.drasi.findUnique({ where: { id: drasiId }, select: { description: true } });
          return drasi ? { description: drasi.description ?? '' } : null;
        },
        save: async ([drasiId], values) => {
          await prisma.drasi.updateMany({ where: { id: drasiId }, data: { description: projectedText(values.description) } });
        },
        about: ([drasiId]) =>
          this.about(drasiId!, {
            where: (drasi) => `στην περιγραφή της δράσης ${drasi}`,
            link: 'rythmiseis',
            kind: 'settings',
            watchers: () => this.holders(drasiId!, [DrasiRoleKind.ARXIGOS]),
          }),
        people: ([drasiId]) => this.people(drasiId!),
      },
      {
        kind: 'drasi:mythos',
        arity: 1,
        fields: COLLAB_FIELDS.drasiMythos,
        labels: { text: 'Ιστορία του μύθου' },
        access: (user, [drasiId]) => this.scope(user, drasiId!, { view: 'mythos', edit: 'mythos' }),
        load: async ([drasiId]) => {
          const drasi = await prisma.drasi.findUnique({ where: { id: drasiId }, select: { mythosText: true } });
          return drasi ? { text: drasi.mythosText ?? '' } : null;
        },
        save: async ([drasiId], values) => {
          await prisma.drasi.updateMany({ where: { id: drasiId }, data: { mythosText: projectedText(values.text) } });
        },
        about: ([drasiId]) =>
          this.about(drasiId!, {
            where: (drasi) => `στον μύθο της δράσης ${drasi}`,
            link: 'mythos',
            kind: 'mythos',
            watchers: () => this.holders(drasiId!, [DrasiRoleKind.ARXIGOS, DrasiRoleKind.PROGRAMMA]),
          }),
        people: ([drasiId]) => this.people(drasiId!),
      },
      {
        kind: 'drasi:character',
        arity: 2,
        fields: COLLAB_FIELDS.drasiCharacter,
        labels: { lore: 'Ο ρόλος (lore)' },
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
        about: async ([drasiId, characterId]) => {
          const character = await prisma.drasiCharacter.findFirst({
            where: { id: characterId, drasiId },
            select: { name: true, participant: { select: { userId: true } } },
          });
          if (!character) return null;
          // Το μαθαίνει όποιος παίζει τον ρόλο.
          return this.about(drasiId!, {
            where: (drasi) => `στον ρόλο «${character.name}» — δράση ${drasi}`,
            link: 'mythos',
            kind: 'character',
            watchers: async () => (character.participant ? [character.participant.userId] : []),
          });
        },
        people: ([drasiId]) => this.people(drasiId!),
      },
    ];
    return [...specs.map(textDocument), this.itemType(), this.mealType(), this.roomType()];
  }

  /**
   * Το δωμάτιο της δράσης (`drasi:<id>:room`): ποιος είναι μέσα και «άλλαξε αυτό»
   * για τις καρτέλες που δεν είναι κοινά έγγραφα (ωρολόγιο, ομάδες, συμμετέχοντες…).
   * Μπαίνει όποιος βλέπει τη δράση.
   */
  private roomType(): CollabDocumentType {
    return {
      kind: 'drasi:room',
      arity: 1,
      room: true,
      access: async (user, [drasiId]) => ((await this.access.accessFor(user, drasiId!).catch(() => null)) ? 'read' : null),
      seed: async () => true,
      project: async () => undefined,
    };
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
      snapshot: (doc) => ({ ...readItem(doc) }),
      present: presentItem,
      restore: restoreItem,
      // Τα σχόλια του προγραμματικού τα μαθαίνουν οι υπεύθυνοι του στοιχείου.
      about: async ([drasiId, itemId]) => {
        const item = await prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId }, select: { title: true } });
        if (!item) return null;
        return this.about(drasiId!, {
          where: (drasi) => `στο «${item.title}» — δράση ${drasi}`,
          link: `programma/${itemId}`,
          kind: 'item',
          watchers: () => this.assignees(itemId!),
        });
      },
      people: ([drasiId]) => this.people(drasiId!),
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
      snapshot: (doc) => ({ ...readMeal(doc) }),
      present: presentMeal,
      restore: restoreMeal,
      // Τα σχόλια του γεύματος: οι υπεύθυνοί του, η μαγείρισσα και η τροφοδοσία.
      about: async ([drasiId, itemId]) => {
        const item = await prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId }, select: { title: true } });
        if (!item) return null;
        return this.about(drasiId!, {
          where: (drasi) => `στο γεύμα «${item.title}» — δράση ${drasi}`,
          link: `diatrofologio/${itemId}`,
          kind: 'meal',
          watchers: async () => [
            ...new Set([...(await this.assignees(itemId!)), ...(await this.holders(drasiId!, [DrasiRoleKind.MAGEIRISSA, DrasiRoleKind.TROFODOSIA]))]),
          ],
        });
      },
      people: ([drasiId]) => this.people(drasiId!),
    };
  }
}
