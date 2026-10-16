import { Injectable, type OnModuleInit } from '@nestjs/common';
import { COLLAB_FIELDS, TOPIKO_SYMVOULIA, can, type KladosType } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { accessProfileOf, hasCapabilityFor } from '../../common/util/klados-scope';
import type { CollabAccess, CollabDocumentType } from '../collab/collab-documents';
import { CollabService } from '../collab/collab.service';

/**
 * Ατζέντα και πρακτικά συμβουλίου ως κοινό έγγραφο (`symvoulio:<id>`).
 *
 * Βλέπει όποιος βλέπει το συμβούλιο (`GET`)· γράφει όποιος θα μπορούσε να το
 * αλλάξει (`PATCH`) — και κανείς μετά την οριστικοποίηση.
 */
@Injectable()
export class SymvoulioCollab implements CollabDocumentType, OnModuleInit {
  readonly kind = 'symvoulio';
  readonly arity = 1;
  readonly fields = COLLAB_FIELDS.symvoulio;

  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
  ) {}

  onModuleInit(): void {
    this.collab.registry.register(this);
  }

  async access(user: RequestUser, [id]: readonly string[]): Promise<CollabAccess | null> {
    const symvoulio = await this.prisma.symvoulio.findFirst({
      where: { id, topikoId: user.topikoId, archivedAt: null },
      select: { type: true, finalizedAt: true, klados: { select: { type: true } } },
    });
    if (!symvoulio) return null;
    const klados = symvoulio.klados?.type as KladosType | undefined;
    if (!hasCapabilityFor(user, 'calendar:read', klados)) return null;
    if (symvoulio.finalizedAt) return 'read';

    // Τα συμβούλια Τοπικού τα γράφει μόνο όποιος έχει και το δικαίωμα Τοπικού —
    // ίδιος κανόνας με το `assertAccess` του service.
    const topiko = (TOPIKO_SYMVOULIA as readonly string[]).includes(symvoulio.type);
    const writes =
      hasCapabilityFor(user, 'symvoulio:klados:write', klados) &&
      (!topiko || can(accessProfileOf(user), 'symvoulio:topiko:write'));
    return writes ? 'write' : 'read';
  }

  async load([id]: readonly string[]): Promise<Record<string, string> | null> {
    const symvoulio = await this.prisma.symvoulio.findUnique({ where: { id }, select: { agenda: true, minutes: true } });
    return symvoulio ? { agenda: symvoulio.agenda ?? '', minutes: symvoulio.minutes ?? '' } : null;
  }

  async project([id]: readonly string[], values: Record<string, string>): Promise<void> {
    await this.prisma.symvoulio.update({ where: { id }, data: { agenda: values.agenda, minutes: values.minutes } });
  }
}
