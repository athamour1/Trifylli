import { Injectable, type OnModuleInit } from '@nestjs/common';
import { MemberKind, MemberStatus } from '@prisma/client';
import { COLLAB_FIELDS, type CommentPerson } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { textDocument, type CollabAccess, type CollabDocumentAbout } from '../collab/collab-documents';
import { CollabService } from '../collab/collab.service';
import { SymvoulioAccess } from './symvoulio-access';
import { symvoulioLink } from './symvoulio-link';

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
    private readonly symvoulioAccess: SymvoulioAccess,
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
    const symvoulio = await this.prisma.symvoulio.findUnique({ where: { id }, select: { title: true, date: true, chairId: true, drasiId: true } });
    if (!symvoulio) return null;
    const name = symvoulio.title?.trim()
      ? `«${symvoulio.title.trim()}»`
      : `της ${symvoulio.date.toLocaleDateString('el-GR', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Athens' })}`;
    return { title: `στο συμβούλιο ${name}`, link: symvoulioLink({ id, drasiId: symvoulio.drasiId }), watchers: symvoulio.chairId ? [symvoulio.chairId] : [] };
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

  /** Ο ίδιος κανόνας με το service (`SymvoulioAccess`)· μετά την οριστικοποίηση μόνο ανάγνωση. */
  async access(user: RequestUser, [id]: readonly string[]): Promise<CollabAccess | null> {
    const symvoulio = await this.prisma.symvoulio.findFirst({
      where: { id, topikoId: user.topikoId, archivedAt: null },
      select: { type: true, drasiId: true, finalizedAt: true, klados: { select: { type: true } } },
    });
    if (!symvoulio) return null;
    const grant = await this.symvoulioAccess.grant(user, symvoulio);
    if (!grant.view) return null;
    if (symvoulio.finalizedAt) return 'read';
    return grant.write ? 'write' : 'read';
  }

  async load([id]: readonly string[]): Promise<Record<string, string> | null> {
    const symvoulio = await this.prisma.symvoulio.findUnique({ where: { id }, select: { agenda: true, minutes: true } });
    return symvoulio ? { agenda: symvoulio.agenda ?? '', minutes: symvoulio.minutes ?? '' } : null;
  }

  async save([id]: readonly string[], values: Record<string, string>): Promise<void> {
    await this.prisma.symvoulio.update({ where: { id }, data: { agenda: values.agenda, minutes: values.minutes } });
  }
}
