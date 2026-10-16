import { Injectable, type OnModuleInit } from '@nestjs/common';
import { MemberKind, MemberStatus } from '@prisma/client';
import type { KladosType } from '@trifylli/shared';
import type { Doc } from 'yjs';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hasCapabilityFor } from '../../common/util/klados-scope';
import type { CollabAccess } from '../collab/collab-documents';
import { CollabService } from '../collab/collab.service';
import { normalizePlan, readPlan, seedPlan } from './syggentrwsh-plan';

/**
 * Όλο το πρόγραμμα μιας συγκέντρωσης ως **ένα** κοινό έγγραφο (`syggentrwsh:<id>`):
 * μέρη και σημειώσεις τους, κομμάτια, λίστα υλικού, στελέχη. Ένα όριο
 * δικαιωμάτων — όποιος γράφει τη συγκέντρωση γράφει όλο το πρόγραμμα.
 *
 * Στη βάση γράφεται με **σταθερά id** (τα id των κομματιών είναι του εγγράφου),
 * οπότε οι εικόνες, η εκτύπωση και οι αναφορές δεν χάνουν τίποτα ανάμεσα σε
 * δύο αποθηκεύσεις.
 */
@Injectable()
export class SyggentrwshCollab implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
  ) {}

  onModuleInit(): void {
    this.collab.registry.register({
      kind: 'syggentrwsh',
      arity: 1,
      access: (user, ids) => this.access(user, ids),
      seed: (doc, ids) => this.seed(doc, ids),
      project: (doc, ids) => this.project(doc, ids),
    });
  }

  /** Βλέπει όποιος βλέπει τη συγκέντρωση (`GET`)· γράφει όποιος τη σχεδιάζει. */
  async access(user: RequestUser, [id]: readonly string[]): Promise<CollabAccess | null> {
    const syggentrwsh = await this.prisma.syggentrwsh.findFirst({
      where: { id, archivedAt: null, klados: { topikoId: user.topikoId } },
      select: { klados: { select: { type: true } } },
    });
    if (!syggentrwsh) return null;
    const klados = syggentrwsh.klados.type as KladosType;
    if (!hasCapabilityFor(user, 'calendar:read', klados)) return null;
    return hasCapabilityFor(user, 'syggentrwsh:write', klados) ? 'write' : 'read';
  }

  async seed(doc: Doc, [id]: readonly string[]): Promise<boolean> {
    const syggentrwsh = await this.prisma.syggentrwsh.findUnique({
      where: { id },
      select: {
        parts: { select: { section: true, notes: true, durationMin: true } },
        timeline: {
          orderBy: [{ section: 'asc' }, { order: 'asc' }],
          select: {
            id: true,
            section: true,
            order: true,
            title: true,
            description: true,
            durationMin: true,
            responsibleId: true,
            yliko: { select: { qty: true, yliko: { select: { id: true, name: true } } } },
          },
        },
        ylikoItems: { orderBy: { order: 'asc' }, select: { id: true, order: true, label: true, qty: true, packed: true } },
        stelexi: { select: { userId: true } },
      },
    });
    if (!syggentrwsh) return false;
    seedPlan(doc, {
      parts: syggentrwsh.parts,
      blocks: syggentrwsh.timeline,
      yliko: syggentrwsh.ylikoItems,
      stelexi: syggentrwsh.stelexi.map((s) => s.userId),
    });
    return true;
  }

  /** Το έγγραφο στη βάση — κανονικοποιημένο, σε μία συναλλαγή. */
  async project(doc: Doc, [id]: readonly string[]): Promise<void> {
    const syggentrwsh = await this.prisma.syggentrwsh.findUnique({
      where: { id },
      select: { kladosId: true, klados: { select: { topikoId: true } } },
    });
    if (!syggentrwsh) return;

    const plan = readPlan(doc);
    const wantedYliko = [...new Set(plan.blocks.flatMap((b) => b.yliko.map((use) => use.id)))];
    const [stelexi, yliko] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          topikoId: syggentrwsh.klados.topikoId,
          archivedAt: null,
          status: MemberStatus.ENERGO,
          kind: MemberKind.STELEXOS,
          memberships: { some: { kladosId: syggentrwsh.kladosId, leftAt: null } },
        },
        select: { id: true },
      }),
      wantedYliko.length
        ? this.prisma.yliko.findMany({ where: { id: { in: wantedYliko }, topikoId: syggentrwsh.klados.topikoId }, select: { id: true } })
        : Promise.resolve([] as { id: string }[]),
    ]);
    const write = normalizePlan(plan, {
      stelexi: new Set(stelexi.map((s) => s.id)),
      yliko: new Set(yliko.map((y) => y.id)),
    });

    await this.prisma.$transaction(async (tx) => {
      // Ίδια id με το έγγραφο: η διαγραφή και η εισαγωγή κρατούν την ταυτότητα των
      // κομματιών, και αποφεύγουν τις συγκρούσεις του `@@unique(section, order)`.
      await tx.timelineBlock.deleteMany({ where: { syggentrwshId: id } });
      if (write.blocks.length) {
        await tx.timelineBlock.createMany({
          data: write.blocks.map(({ yliko: _yliko, ...block }) => ({ ...block, syggentrwshId: id })),
        });
        const uses = write.blocks.flatMap((block) => block.yliko.map((use) => ({ blockId: block.id, ...use })));
        if (uses.length) await tx.timelineBlockYliko.createMany({ data: uses, skipDuplicates: true });
      }

      await tx.syggentrwshSection.deleteMany({ where: { syggentrwshId: id } });
      if (write.sections.length) {
        await tx.syggentrwshSection.createMany({ data: write.sections.map((part) => ({ ...part, syggentrwshId: id })) });
      }

      await tx.syggentrwshYlikoItem.deleteMany({ where: { syggentrwshId: id } });
      if (write.yliko.length) {
        await tx.syggentrwshYlikoItem.createMany({ data: write.yliko.map((item) => ({ ...item, syggentrwshId: id })) });
      }

      await tx.syggentrwshStelexos.deleteMany({ where: { syggentrwshId: id } });
      if (write.stelexi.length) {
        await tx.syggentrwshStelexos.createMany({ data: write.stelexi.map((userId) => ({ syggentrwshId: id, userId })) });
      }
    });
  }
}
