import {
  BeforeApplicationShutdown,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  collabColor,
  collabShortName,
  type CollabPerson,
  type CollabVersionSummary,
  type CollabVersionView,
  type DocReadersView,
} from '@trifylli/shared';
import { Doc, applyUpdate } from 'yjs';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CollabDocumentType } from './collab-documents';
import { CollabService } from './collab.service';

/** Μετά από πόση ησυχία ένα έγγραφο που άλλαξε κρατά έκδοση. */
const IDLE_MS = 10 * 60_000;
/** Πόσες αυτόματες εκδόσεις κρατά κάθε έγγραφο — τα ορόσημα μένουν όλα. */
const KEEP_AUTO = 100;
/** Πόσες εκδόσεις δείχνει η λίστα. */
const LIST_SIZE = 200;

const PERSON = { id: true, firstName: true, lastName: true } as const;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Ίδιο περιεχόμενο; Η σειρά των κλειδιών δεν μετράει (το JSONB της βάσης την αλλάζει). */
export function sameContent(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

/**
 * Το ιστορικό των κοινών εγγράφων (συνεργασία, Φ10). Ο server κρατά εκδόσεις
 * μόνος του: όταν ένα έγγραφο σταματήσει να αλλάζει για ~10΄, όταν φύγει και ο
 * τελευταίος, και στα ορόσημα (οριστικοποίηση, έγκριση, κλειστή δράση). Κάθε
 * έκδοση είναι η απλή μορφή του εγγράφου (`snapshot` του είδους) και όσοι
 * έγραψαν από την προηγούμενη — το ξέρει ο server από τις συνδέσεις.
 *
 * Η επαναφορά είναι **νέα** αλλαγή, με τις μικρότερες αλλαγές: όποιος γράφει
 * εκείνη τη στιγμή δεν χάνει τη θέση του, και η τωρινή μορφή μένει στο ιστορικό.
 * Και το «Το διάβασαν»: ποιος άνοιξε την τελευταία έκδοση.
 */
@Injectable()
export class CollabHistoryService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger('CollabHistory');
  /** Όσοι έγραψαν σε κάθε έγγραφο από την τελευταία έκδοση. */
  private readonly pending = new Map<string, Set<string>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Αλλάζουν μόνο στις δοκιμές. */
  idleMs = IDLE_MS;
  keepAuto = KEEP_AUTO;

  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
  ) {}

  onModuleInit(): void {
    this.collab.onDocumentWritten((name, writers) => this.written(name, writers));
    this.collab.onDocumentIdle((name) => void this.flush(name));
    this.collab.onMilestone((name, label) => this.milestone(name, label));
    this.collab.onRemoved(async (name, prefix) => {
      for (const key of [...this.pending.keys()]) if (prefix ? key.startsWith(name) : key === name) this.cancel(key);
      const where = { document: prefix ? { startsWith: name } : name };
      await this.prisma.docRead.deleteMany({ where });
      await this.prisma.collabVersion.deleteMany({ where });
    });
  }

  async beforeApplicationShutdown(): Promise<void> {
    // Ό,τι άλλαξε και δεν έγινε ακόμα έκδοση: τώρα, πριν σβήσει ο server.
    await Promise.allSettled([...this.pending.keys()].map((name) => this.flush(name)));
  }

  // ───────────────────────── Πότε κρατιέται έκδοση ─────────────────────────

  private type(name: string): { type: CollabDocumentType; ids: string[] } | null {
    const target = this.collab.registry.resolve(name);
    return target?.type.snapshot && !target.type.room ? target : null;
  }

  /** Κάποιοι έγραψαν (και σώθηκε): έκδοση όταν σταματήσει να αλλάζει. */
  private written(name: string, writers: ReadonlySet<string>): void {
    if (!this.type(name)) return;
    const pending = this.pending.get(name) ?? new Set<string>();
    for (const writer of writers) pending.add(writer);
    this.pending.set(name, pending);
    const timer = this.timers.get(name);
    if (timer) clearTimeout(timer);
    const next = setTimeout(() => void this.flush(name), this.idleMs);
    next.unref?.();
    this.timers.set(name, next);
  }

  private cancel(name: string): void {
    const timer = this.timers.get(name);
    if (timer) clearTimeout(timer);
    this.timers.delete(name);
    this.pending.delete(name);
  }

  /** Ό,τι γράφτηκε από την τελευταία έκδοση γίνεται έκδοση — τώρα. */
  async flush(name: string): Promise<void> {
    const writers = this.pending.get(name);
    this.cancel(name);
    if (!writers?.size) return;
    try {
      await this.take(name, [...writers], null);
    } catch (error) {
      this.logger.warn({ event: 'collab-version-failed', document: name, message: (error as Error).message });
    }
  }

  /** Ορόσημο: έκδοση τώρα, με ετικέτα — μαζί με όσους εκκρεμούσαν. */
  async milestone(name: string, label: string): Promise<void> {
    if (!this.type(name)) return;
    const writers = [...(this.pending.get(name) ?? [])];
    this.cancel(name);
    await this.take(name, writers, label);
  }

  /** Η τωρινή απλή μορφή — από τη μνήμη αν είναι ανοιχτό, αλλιώς από τη βάση. */
  private async contentOf(name: string, type: CollabDocumentType): Promise<Record<string, unknown> | null> {
    const loaded = this.collab.hocuspocus.documents.get(name);
    if (loaded) return type.snapshot!(loaded);
    const row = await this.prisma.collabDocument.findUnique({ where: { name }, select: { state: true } });
    if (!row) return null;
    const doc = new Doc();
    try {
      applyUpdate(doc, new Uint8Array(row.state));
      return type.snapshot!(doc);
    } finally {
      doc.destroy();
    }
  }

  /**
   * Νέα έκδοση — εκτός αν το περιεχόμενο είναι ίδιο με της τελευταίας: τότε ένα
   * ορόσημο μπαίνει ως ετικέτα σε εκείνη (αν δεν έχει ήδη άλλη).
   */
  private async take(name: string, writers: string[], label: string | null): Promise<string | null> {
    const target = this.type(name);
    if (!target) return null;
    const content = await this.contentOf(name, target.type);
    if (!content) return null;
    const latest = await this.prisma.collabVersion.findFirst({
      where: { document: name },
      orderBy: { createdAt: 'desc' },
      select: { id: true, content: true, label: true },
    });
    if (latest && sameContent(latest.content, content)) {
      if (!label || latest.label === label) return latest.id;
      if (!latest.label) {
        await this.prisma.collabVersion.update({ where: { id: latest.id }, data: { label } });
        return latest.id;
      }
    }
    const created = await this.prisma.collabVersion.create({
      data: { document: name, content: content as Prisma.InputJsonValue, writerIds: writers, label },
      select: { id: true },
    });
    await this.prune(name);
    return created.id;
  }

  /** Οι αυτόματες εκδόσεις πέρα από τις νεότερες `keepAuto` φεύγουν· τα ορόσημα μένουν. */
  private async prune(name: string): Promise<void> {
    const old = await this.prisma.collabVersion.findMany({
      where: { document: name, label: null },
      orderBy: { createdAt: 'desc' },
      skip: this.keepAuto,
      select: { id: true },
    });
    if (old.length) await this.prisma.collabVersion.deleteMany({ where: { id: { in: old.map((version) => version.id) } } });
  }

  // ───────────────────────── Για τη σελίδα ─────────────────────────

  /** Το ιστορικό το βλέπει όποιος βλέπει το έγγραφο. */
  private async viewable(user: RequestUser, document: string): Promise<{ type: CollabDocumentType; ids: string[] }> {
    const target = this.type(document);
    if (!target || !(await this.collab.documentAccess(user, document))) throw new NotFoundException('Το έγγραφο δεν βρέθηκε.');
    return target;
  }

  private async peopleById(ids: readonly string[]): Promise<Map<string, CollabPerson>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const people: CollabPerson[] = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: PERSON });
    return new Map(people.map((person) => [person.id, person]));
  }

  async list(user: RequestUser, document: string): Promise<CollabVersionSummary[]> {
    await this.viewable(user, document);
    // Οι τελευταίες αλλαγές γίνονται έκδοση: η λίστα αρχίζει από το «τώρα».
    await this.flush(document);
    const versions: { id: string; createdAt: Date; label: string | null; writerIds: string[] }[] = await this.prisma.collabVersion.findMany({
      where: { document },
      orderBy: { createdAt: 'desc' },
      take: LIST_SIZE,
      select: { id: true, createdAt: true, label: true, writerIds: true },
    });
    const people = await this.peopleById(versions.flatMap((version) => version.writerIds));
    return versions.map((version) => ({
      id: version.id,
      createdAt: version.createdAt.toISOString(),
      label: version.label,
      writers: version.writerIds.map((id) => people.get(id)).filter((person): person is CollabPerson => !!person),
    }));
  }

  async get(user: RequestUser, id: string): Promise<CollabVersionView> {
    const version = await this.prisma.collabVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Η έκδοση δεν βρέθηκε.');
    const target = await this.viewable(user, version.document);
    const previous = await this.prisma.collabVersion.findFirst({
      where: { document: version.document, createdAt: { lt: version.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });
    const present = (content: unknown) => target.type.present?.(content as Record<string, unknown>) ?? [];
    const people = await this.peopleById(version.writerIds);
    return {
      id: version.id,
      createdAt: version.createdAt.toISOString(),
      label: version.label,
      writers: version.writerIds.map((writer) => people.get(writer)).filter((person): person is CollabPerson => !!person),
      parts: present(version.content),
      previous: previous ? present(previous.content) : null,
    };
  }

  /**
   * Το έγγραφο ξαναγίνεται όπως η έκδοση — για όλους, ως νέα αλλαγή. Πρώτα η
   * τωρινή μορφή γίνεται έκδοση (αν διαφέρει), ώστε να μη χαθεί τίποτα.
   */
  async restore(user: RequestUser, id: string, origin: string | null): Promise<{ id: string | null }> {
    const version = await this.prisma.collabVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Η έκδοση δεν βρέθηκε.');
    const target = await this.viewable(user, version.document);
    const name = version.document;
    if (!target.type.restore || (await this.collab.documentAccess(user, name)) !== 'write' || !this.collab.isWritable(name)) {
      throw new ForbiddenException('Δεν μπορείς να αλλάξεις αυτό το έγγραφο.');
    }

    const writers = [...(this.pending.get(name) ?? [])];
    this.cancel(name);
    await this.take(name, writers, null);

    const context = {
      requestId: 'restore',
      userId: user.id,
      user: { id: user.id, name: collabShortName(user.firstName, user.lastName), fullName: `${user.firstName} ${user.lastName}`, color: collabColor(user.id) },
    };
    const connection = await this.collab.hocuspocus.openDirectConnection(name, context);
    try {
      await connection.transact((doc) => target.type.restore!(doc, version.content as Record<string, unknown>));
    } finally {
      await connection.disconnect();
    }
    // Η επαναφορά γράφτηκε (και σώθηκε): είναι η ίδια μια έκδοση, με όνομα.
    this.cancel(name);
    const restored = await this.take(name, [user.id], 'Επαναφορά');
    this.collab.broadcast(name, { topic: 'versions', by: user.id, origin });
    return { id: restored };
  }

  // ───────────────────────── «Το διάβασαν» ─────────────────────────

  /** Ο χρήστης άνοιξε την τελευταία έκδοση. */
  async read(user: RequestUser, document: string): Promise<void> {
    await this.viewable(user, document);
    const latest = await this.prisma.collabVersion.findFirst({ where: { document }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (!latest) return;
    const before = await this.prisma.docRead.findUnique({ where: { document_userId: { document, userId: user.id } }, select: { versionId: true } });
    await this.prisma.docRead.upsert({
      where: { document_userId: { document, userId: user.id } },
      create: { document, userId: user.id, versionId: latest.id },
      update: { versionId: latest.id, readAt: new Date() },
    });
    if (before?.versionId !== latest.id) this.collab.broadcast(document, { topic: 'reads', by: user.id, origin: null });
  }

  /** «Το διάβασαν 5/8»: ποια στελέχη του εγγράφου άνοιξαν την τελευταία έκδοση. */
  async readers(user: RequestUser, document: string): Promise<DocReadersView> {
    const target = await this.viewable(user, document);
    const latest = await this.prisma.collabVersion.findFirst({
      where: { document },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, label: true },
    });
    const [audience, reads] = await Promise.all([
      target.type.people?.(target.ids) ?? Promise.resolve([] as CollabPerson[]),
      this.prisma.docRead.findMany({ where: { document }, select: { versionId: true, readAt: true, user: { select: PERSON } } }),
    ]);
    return {
      version: latest ? { id: latest.id, createdAt: latest.createdAt.toISOString(), label: latest.label } : null,
      audience,
      readers: reads.map((read: { versionId: string; readAt: Date; user: CollabPerson }) => ({
        person: read.user,
        readAt: read.readAt.toISOString(),
        current: read.versionId === latest?.id,
      })),
    };
  }
}
