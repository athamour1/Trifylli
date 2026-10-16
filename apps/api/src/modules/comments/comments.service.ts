import { BadRequestException, ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import {
  COMMENT_LIMITS,
  collabShortName,
  type CommentAnchor,
  type CommentPerson,
  type CommentThreadView,
  type CommentView,
} from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CollabDocumentAbout, CollabDocumentType } from '../collab/collab-documents';
import { CollabService } from '../collab/collab.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Relative position του Yjs, σε base64. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Το κλειδί ενός κειμένου μέσα στο έγγραφο: `description`, `section:INTRO`, `block:<uuid>`. */
const FIELD = /^[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$/;

const PERSON = { id: true, firstName: true, lastName: true } as const;
const COMMENT = {
  id: true,
  field: true,
  anchorStart: true,
  anchorEnd: true,
  quote: true,
  body: true,
  mentionIds: true,
  parentId: true,
  resolvedAt: true,
  editedAt: true,
  createdAt: true,
  author: { select: PERSON },
  resolvedBy: { select: PERSON },
} as const;

interface CommentRow {
  id: string;
  field: string | null;
  anchorStart: string | null;
  anchorEnd: string | null;
  quote: string | null;
  body: string;
  mentionIds: string[];
  parentId: string | null;
  resolvedAt: Date | null;
  editedAt: Date | null;
  createdAt: Date;
  author: CommentPerson | null;
  resolvedBy: CommentPerson | null;
}

/** Νέο σχόλιο: σε φράση (`field` + `anchor`), σε όλο το κείμενο (`field`), ή απάντηση (`parentId`). */
export interface NewComment {
  document: string;
  field?: string | null;
  anchor?: CommentAnchor | null;
  quote?: string | null;
  body: string;
  mentionIds?: string[];
  parentId?: string | null;
}

interface Target {
  type: CollabDocumentType;
  ids: string[];
  about: CollabDocumentAbout;
}

function toView(row: CommentRow, people: ReadonlyMap<string, CommentPerson>): CommentView {
  return {
    id: row.id,
    field: row.field,
    anchor: row.anchorStart && row.anchorEnd ? { start: row.anchorStart, end: row.anchorEnd } : null,
    quote: row.quote,
    body: row.body,
    mentions: row.mentionIds.map((id) => people.get(id)).filter((person): person is CommentPerson => !!person),
    author: row.author,
    parentId: row.parentId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function cleanBody(body: string): string {
  const text = body.trim();
  if (!text) throw new BadRequestException('Κενό σχόλιο.');
  if (text.length > COMMENT_LIMITS.body) throw new BadRequestException(`Το σχόλιο ξεπερνά τους ${COMMENT_LIMITS.body} χαρακτήρες.`);
  return text;
}

function cleanAnchor(anchor: CommentAnchor | null | undefined): CommentAnchor | null {
  if (!anchor) return null;
  const valid = (value: string) => value.length <= COMMENT_LIMITS.anchor && BASE64.test(value);
  if (!valid(anchor.start) || !valid(anchor.end)) throw new BadRequestException('Άκυρη θέση στο κείμενο.');
  return { start: anchor.start, end: anchor.end };
}

function cleanField(field: string | null | undefined): string | null {
  if (!field) return null;
  if (field.length > COMMENT_LIMITS.field || !FIELD.test(field)) throw new BadRequestException('Άκυρο κείμενο.');
  return field;
}

/** Το απόσπασμα κόβεται (δεν απορρίπτεται): είναι για να θυμάται κανείς πού ήταν. */
function cleanQuote(quote: string | null | undefined): string | null {
  const text = quote?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > COMMENT_LIMITS.quote ? `${text.slice(0, COMMENT_LIMITS.quote - 1)}…` : text;
}

/**
 * Σχόλια στα κοινά έγγραφα (συνεργασία, Φ9). Ζουν έξω από το Yjs: σχολιάζει
 * όποιος **βλέπει** το έγγραφο (ερώτημα 9), επεξεργάζεται και σβήνει μόνο ο
 * συντάκτης, και τα νήματα έχουν ένα επίπεδο. Σχολιάζονται μόνο τα είδη που
 * λένε τι είναι (`about`) — όχι δωμάτια, όχι ό,τι δεν δηλώθηκε.
 *
 * Κάθε αλλαγή φτάνει ζωντανά σε όσους έχουν ανοιχτό το έγγραφο (`comments`), με
 * ειδοποιήσεις σε όσους αναφέρθηκαν με «@», σε όσους είναι στο νήμα, και — για
 * τα νέα νήματα — σε όσους παρακολουθούν το έγγραφο (π.χ. οι υπεύθυνοι).
 */
@Injectable()
export class CommentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    // Το έγγραφο έφυγε μαζί με την οντότητά του: και τα σχόλιά του.
    this.collab.onRemoved(async (name, prefix) => {
      await this.prisma.comment.deleteMany({ where: { document: prefix ? { startsWith: name } : name } });
    });
  }

  /** Το έγγραφο, αν σχολιάζεται και αν το βλέπει ο χρήστης· αλλιώς «δεν βρέθηκε». */
  private async target(user: RequestUser, document: string): Promise<Target> {
    const target = this.collab.registry.resolve(document);
    const access = target && !target.type.room && target.type.about ? await this.collab.documentAccess(user, document) : null;
    const about = access ? await target!.type.about!(target!.ids) : null;
    if (!about) throw new NotFoundException('Το έγγραφο δεν βρέθηκε.');
    return { type: target!.type, ids: target!.ids, about };
  }

  async list(user: RequestUser, document: string): Promise<CommentThreadView[]> {
    await this.target(user, document);
    const rows: CommentRow[] = await this.prisma.comment.findMany({ where: { document }, orderBy: { createdAt: 'asc' }, select: COMMENT });
    const people = await this.peopleById(rows.flatMap((row) => row.mentionIds));
    const threads = new Map<string, CommentThreadView>();
    for (const row of rows) if (!row.parentId) threads.set(row.id, { ...toView(row, people), replies: [] });
    for (const row of rows) if (row.parentId) threads.get(row.parentId)?.replies.push(toView(row, people));
    return [...threads.values()];
  }

  /** Τα στελέχη που αναφέρονται με «@» σε αυτό το έγγραφο. */
  async people(user: RequestUser, document: string): Promise<CommentPerson[]> {
    const target = await this.target(user, document);
    return (await target.type.people?.(target.ids)) ?? [];
  }

  /** `notify: false` όταν την ειδοποίηση τη στέλνει όποιος καλεί (π.χ. η «Επιστροφή» μιας έγκρισης). */
  async create(user: RequestUser, input: NewComment, origin: string | null, options: { notify?: boolean } = {}): Promise<CommentView> {
    const target = await this.target(user, input.document);
    const body = cleanBody(input.body);

    // Νήμα ενός επιπέδου: η απάντηση σε απάντηση πάει στο ίδιο νήμα.
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await this.prisma.comment.findFirst({ where: { id: input.parentId, document: input.document }, select: { id: true, parentId: true } });
      if (!parent) throw new NotFoundException('Το σχόλιο δεν βρέθηκε.');
      parentId = parent.parentId ?? parent.id;
    }
    // Η απάντηση δεν έχει δική της φράση: ανήκει στο νήμα.
    const field = parentId ? null : cleanField(input.field);
    const anchor = parentId ? null : cleanAnchor(input.anchor);
    if (anchor && !field) throw new BadRequestException('Η φράση χρειάζεται και το κείμενο όπου βρίσκεται.');
    if ((await this.prisma.comment.count({ where: { document: input.document } })) >= COMMENT_LIMITS.perDocument) {
      throw new BadRequestException('Πάρα πολλά σχόλια σε αυτό το έγγραφο.');
    }
    const mentionIds = await this.mentions(target, input.mentionIds);

    const row: CommentRow = await this.prisma.comment.create({
      data: {
        document: input.document,
        field,
        anchorStart: anchor?.start ?? null,
        anchorEnd: anchor?.end ?? null,
        quote: parentId ? null : cleanQuote(input.quote),
        body,
        mentionIds,
        authorId: user.id,
        parentId,
      },
      select: COMMENT,
    });

    this.changed(input.document, user, origin);
    if (target.about.activity) {
      this.collab.apiChanged({ room: target.about.activity.room, topic: target.about.activity.topic, verb: 'add', by: user.id, origin });
    }
    const thread = parentId ?? row.id;
    if (options.notify !== false) {
      void this.announce(user, target.about, thread, mentionIds, parentId ? await this.inThread(thread) : target.about.watchers, !!parentId);
    }
    return toView(row, await this.peopleById(mentionIds));
  }

  /** Νέο κείμενο — μόνο ο συντάκτης. Ειδοποιούνται μόνο όσοι αναφέρθηκαν τώρα για πρώτη φορά. */
  async edit(user: RequestUser, id: string, input: { body: string; mentionIds?: string[] }, origin: string | null): Promise<CommentView> {
    const { comment, target } = await this.own(user, id);
    const body = cleanBody(input.body);
    const mentionIds = await this.mentions(target, input.mentionIds);
    const row: CommentRow = await this.prisma.comment.update({ where: { id }, data: { body, mentionIds, editedAt: new Date() }, select: COMMENT });

    this.changed(comment.document, user, origin);
    const added = mentionIds.filter((mention) => !comment.mentionIds.includes(mention));
    void this.announce(user, target.about, comment.parentId ?? comment.id, added, [], false);
    return toView(row, await this.peopleById(mentionIds));
  }

  /** Σβήνει το σχόλιο — και τις απαντήσεις του, αν είναι το πρώτο του νήματος. Μόνο ο συντάκτης. */
  async remove(user: RequestUser, id: string, origin: string | null): Promise<void> {
    const { comment } = await this.own(user, id);
    await this.prisma.comment.delete({ where: { id } });
    this.changed(comment.document, user, origin);
  }

  /** «Επιλύθηκε» (ή ξανά ανοιχτό): όλο το νήμα, από όποιον βλέπει το έγγραφο. */
  async resolve(user: RequestUser, id: string, resolved: boolean, origin: string | null): Promise<CommentView> {
    const comment = await this.prisma.comment.findUnique({ where: { id }, select: { document: true, parentId: true } });
    if (!comment) throw new NotFoundException('Το σχόλιο δεν βρέθηκε.');
    await this.target(user, comment.document);
    if (comment.parentId) throw new BadRequestException('Επιλύεται όλο το νήμα, από το πρώτο του σχόλιο.');

    const row: CommentRow = await this.prisma.comment.update({
      where: { id },
      data: resolved ? { resolvedAt: new Date(), resolvedById: user.id } : { resolvedAt: null, resolvedById: null },
      select: COMMENT,
    });
    this.changed(comment.document, user, origin);
    return toView(row, await this.peopleById(row.mentionIds));
  }

  // ───────────────────────── Βοηθητικά ─────────────────────────

  /** Σχόλιο του χρήστη, σε έγγραφο που ακόμα βλέπει. */
  private async own(user: RequestUser, id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: { id: true, document: true, authorId: true, parentId: true, mentionIds: true },
    });
    if (!comment) throw new NotFoundException('Το σχόλιο δεν βρέθηκε.');
    const target = await this.target(user, comment.document);
    if (comment.authorId !== user.id) throw new ForbiddenException('Μόνο ο συντάκτης αλλάζει ή σβήνει ένα σχόλιο.');
    return { comment, target };
  }

  /** Μόνο στελέχη του εγγράφου (`people`) — οι υπόλοιπες αναφορές αγνοούνται. */
  private async mentions(target: Target, ids: readonly string[] | undefined): Promise<string[]> {
    const wanted = [...new Set(ids ?? [])].slice(0, COMMENT_LIMITS.mentions);
    if (!wanted.length) return [];
    const people = new Set(((await target.type.people?.(target.ids)) ?? []).map((person) => person.id));
    return wanted.filter((id) => people.has(id));
  }

  private async peopleById(ids: readonly string[]): Promise<Map<string, CommentPerson>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const people: CommentPerson[] = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: PERSON });
    return new Map(people.map((person) => [person.id, person]));
  }

  /** Όσοι είναι στο νήμα: όσοι έγραψαν σε αυτό και όσοι αναφέρθηκαν. */
  private async inThread(threadId: string): Promise<string[]> {
    const rows: { authorId: string | null; mentionIds: string[] }[] = await this.prisma.comment.findMany({
      where: { OR: [{ id: threadId }, { parentId: threadId }] },
      select: { authorId: true, mentionIds: true },
    });
    return [...new Set(rows.flatMap((row) => [...(row.authorId ? [row.authorId] : []), ...row.mentionIds]))];
  }

  /** «Άλλαξαν τα σχόλια» σε όσους έχουν ανοιχτό το έγγραφο. */
  private changed(document: string, user: RequestUser, origin: string | null): void {
    this.collab.broadcast(document, { topic: 'comments', by: user.id, origin });
  }

  /**
   * Οι ειδοποιήσεις — τι και πού, ποτέ το κείμενο του σχολίου (μπορεί να έχει
   * ονόματα παιδιών). Πρώτα οι αναφορές· όποιος αναφέρθηκε δεν παίρνει και δεύτερη.
   */
  private async announce(
    author: RequestUser,
    about: CollabDocumentAbout,
    threadId: string,
    mentioned: readonly string[],
    followers: readonly string[],
    reply: boolean,
  ): Promise<void> {
    const link = `${about.link}?comment=${threadId}`;
    const who = collabShortName(author.firstName, author.lastName);
    const mentions = mentioned.filter((id) => id !== author.id);
    if (mentions.length) await this.notifications.notify(mentions, { kind: 'mention', title: `${who} σε ανέφερε σε σχόλιο ${about.title}`, link });
    const others = followers.filter((id) => id !== author.id && !mentioned.includes(id));
    if (others.length) {
      await this.notifications.notify(others, { kind: 'comment', title: `${reply ? 'Απάντηση σε σχόλιο' : 'Νέο σχόλιο'} ${about.title}`, link });
    }
  }
}
