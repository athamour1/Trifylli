import { Injectable, type OnModuleInit } from '@nestjs/common';
import { MemberKind, MemberStatus } from '@prisma/client';
import { COLLAB_FIELDS, TOPIKO_SYMVOULIA, can, type CommentPerson, type KladosType } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { accessProfileOf, hasCapabilityFor } from '../../common/util/klados-scope';
import { textDocument, type CollabAccess, type CollabDocumentAbout } from '../collab/collab-documents';
import { CollabService } from '../collab/collab.service';

/**
 * Ατζέντα και πρακτικά συμβουλίου ως κοινό έγγραφο (`symvoulio:<id>`).
 *
 * Βλέπει όποιος βλέπει το συμβούλιο (`GET`)· γράφει όποιος θα μπορούσε να το
 * αλλάξει (`PATCH`) — και κανείς μετά την οριστικοποίηση.
 */
@Injectable()
export class SymvoulioCollab implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
  ) {}

  onModuleInit(): void {
    this.collab.registry.register(
      textDocument({
        kind: 'symvoulio',
        arity: 1,
        fields: COLLAB_FIELDS.symvoulio,
        labels: { agenda: 'Ατζέντα', minutes: 'Πρακτικά' },
        access: (user, ids) => this.access(user, ids),
        load: (ids) => this.load(ids),
        save: (ids, values) => this.save(ids, values),
        about: (ids) => this.about(ids),
        people: (ids) => this.people(ids),
      }),
    );
  }

  /** Για τα σχόλια: «στο συμβούλιο «…»», και τα μαθαίνει όποιος προεδρεύει. */
  async about([id]: readonly string[]): Promise<CollabDocumentAbout | null> {
    const symvoulio = await this.prisma.symvoulio.findUnique({ where: { id }, select: { title: true, date: true, chairId: true } });
    if (!symvoulio) return null;
    const name = symvoulio.title?.trim()
      ? `«${symvoulio.title.trim()}»`
      : `της ${symvoulio.date.toLocaleDateString('el-GR', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Athens' })}`;
    return { title: `στο συμβούλιο ${name}`, link: `/symvoulia/${id}`, watchers: symvoulio.chairId ? [symvoulio.chairId] : [] };
  }

  /** Όσοι μπορούν να συμμετέχουν (ίδια εμβέλεια με τους συμμετέχοντες): τα στελέχη του κλάδου ή του Τοπικού. */
  async people([id]: readonly string[]): Promise<CommentPerson[]> {
    const symvoulio = await this.prisma.symvoulio.findUnique({ where: { id }, select: { topikoId: true, kladosId: true } });
    if (!symvoulio) return [];
    return this.prisma.user.findMany({
      where: {
        topikoId: symvoulio.topikoId,
        archivedAt: null,
        status: MemberStatus.ENERGO,
        kind: MemberKind.STELEXOS,
        ...(symvoulio.kladosId ? { memberships: { some: { kladosId: symvoulio.kladosId, leftAt: null } } } : {}),
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });
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

  async save([id]: readonly string[], values: Record<string, string>): Promise<void> {
    await this.prisma.symvoulio.update({ where: { id }, data: { agenda: values.agenda, minutes: values.minutes } });
  }
}
