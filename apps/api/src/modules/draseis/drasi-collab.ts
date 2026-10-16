import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DrasiStatus } from '@prisma/client';
import { COLLAB_FIELDS, drasiCan, drasiEditScope, type DrasiPerm } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CollabAccess, CollabDocumentType } from '../collab/collab-documents';
import { projectedText } from '../collab/collab-fields';
import { CollabService } from '../collab/collab.service';
import { DrasiAccessService } from './drasi-access.service';
import { isMeal } from './diatrofologio';

/**
 * Τα κοινά κείμενα μιας δράσης (βλ. docs/synergasia.md): περιγραφή, μύθος, lore
 * των ρόλων, προγραμματικά, συνταγές. Ένα έγγραφο ανά κείμενο, με τους κανόνες
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
    return [
      {
        kind: 'drasi:settings',
        arity: 1,
        fields: COLLAB_FIELDS.drasiSettings,
        access: (user, [drasiId]) => this.scope(user, drasiId!, { view: 'episkopisi', edit: 'rythmiseis' }),
        load: async ([drasiId]) => {
          const drasi = await prisma.drasi.findUnique({ where: { id: drasiId }, select: { description: true } });
          return drasi ? { description: drasi.description ?? '' } : null;
        },
        project: async ([drasiId], values) => {
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
        project: async ([drasiId], values) => {
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
        project: async ([drasiId, characterId], values) => {
          await prisma.drasiCharacter.updateMany({ where: { id: characterId, drasiId }, data: { lore: projectedText(values.lore) } });
        },
      },
      {
        kind: 'drasi:item',
        arity: 2,
        fields: COLLAB_FIELDS.drasiItem,
        access: async (user, [drasiId, itemId]) => {
          const item = await prisma.drasiScheduleItem.findFirst({
            where: { id: itemId, drasiId },
            select: { assignees: { select: { userId: true } } },
          });
          if (!item) return null;
          // Οι υπεύθυνοι του στοιχείου γράφουν το προγραμματικό του (`SCHEDULE_ITEM_OWN_FIELDS`).
          return this.scope(user, drasiId!, { view: 'programma', edit: 'programma' }, async () =>
            item.assignees.some((a) => a.userId === user.id),
          );
        },
        load: async ([drasiId, itemId]) => {
          const item = await prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId }, select: { description: true } });
          return item ? { description: item.description ?? '' } : null;
        },
        project: async ([drasiId, itemId], values) => {
          await prisma.drasiScheduleItem.updateMany({ where: { id: itemId, drasiId }, data: { description: projectedText(values.description) } });
        },
      },
      {
        kind: 'drasi:meal',
        arity: 2,
        fields: COLLAB_FIELDS.drasiMeal,
        access: async (user, [drasiId, itemId]) => {
          const item = await prisma.drasiScheduleItem.findFirst({ where: { id: itemId, drasiId }, select: { kind: true, snack: true } });
          // Συνταγή έχει μόνο ό,τι είναι γεύμα (είδος «Γεύμα» ή ετικέτα κολατσιού).
          if (!item || !isMeal(item)) return null;
          return this.scope(user, drasiId!, { view: 'diatrofologio', edit: 'diatrofologio' });
        },
        load: async ([drasiId, itemId]) => {
          const item = await prisma.drasiScheduleItem.findFirst({
            where: { id: itemId, drasiId },
            select: { meal: { select: { recipe: true } } },
          });
          return item ? { recipe: item.meal?.recipe ?? '' } : null;
        },
        project: async ([, itemId], values) => {
          const recipe = projectedText(values.recipe);
          await prisma.drasiMeal.upsert({ where: { itemId }, create: { itemId: itemId!, recipe }, update: { recipe } });
        },
      },
    ];
  }
}
