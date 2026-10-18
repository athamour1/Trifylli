import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  POLL_LIMITS,
  POLL_YES_NO,
  collabColor,
  collabDocument,
  collabShortName,
  type SymvoulioPollView,
} from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollabService } from '../collab/collab.service';
import { NotificationsService } from '../notifications/notifications.service';
import { pollCounts, pollResultText } from './poll-result';
import { symvoulioLink } from './symvoulio-link';

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

export interface NewPoll {
  question: string;
  /** Κενό = «Ναι/Όχι/Αποχή». */
  options?: string[];
  secret?: boolean;
}

/**
 * Οι ψηφοφορίες του συμβουλίου (συνεργασία, Φ14). Ψηφίζουν οι συμμετέχοντες·
 * ανοίγει και κλείνει όποιος γράφει το συμβούλιο (ίδιος κανόνας με το κοινό του
 * έγγραφο). Επώνυμες εξ ορισμού, ή μυστικές (ερώτημα 13): εκεί κρατιέται ποιος
 * ψήφισε, χωριστά από το τι, και η ψήφος δεν αλλάζει. Τα αποτελέσματα φαίνονται
 * ζωντανά· στο κλείσιμο μπαίνουν στα πρακτικά.
 */
@Injectable()
export class SymvouliaPollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Βλέπει όποιος βλέπει το συμβούλιο· γράφει (ανοίγει, κλείνει) όποιος το γράφει. */
  private async access(user: RequestUser, symvoulioId: string): Promise<'read' | 'write'> {
    const access = await this.collab.documentAccess(user, collabDocument.symvoulio(symvoulioId));
    if (!access) throw new NotFoundException('Το συμβούλιο δεν βρέθηκε.');
    return access;
  }

  private async voterIds(symvoulioId: string): Promise<string[]> {
    const rows = await this.prisma.symvoulioParticipant.findMany({ where: { symvoulioId }, select: { userId: true } });
    return rows.map((row) => row.userId);
  }

  async list(user: RequestUser, symvoulioId: string): Promise<SymvoulioPollView[]> {
    const access = await this.access(user, symvoulioId);
    const [polls, participants] = await Promise.all([
      this.prisma.symvoulioPoll.findMany({
        where: { symvoulioId },
        orderBy: { createdAt: 'desc' },
        include: { createdBy: PERSON, votes: { select: { userId: true, choice: true } }, ballots: { select: { choice: true } } },
      }),
      this.prisma.symvoulioParticipant.findMany({ where: { symvoulioId }, select: { user: PERSON } }),
    ]);
    const people = participants.map((row) => row.user).sort((a, b) => a.lastName.localeCompare(b.lastName, 'el') || a.firstName.localeCompare(b.firstName, 'el'));
    const isVoter = people.some((person) => person.id === user.id);

    return polls.map((poll) => {
      const votes = new Map(poll.votes.map((vote) => [vote.userId, vote.choice]));
      const choices = poll.secret ? poll.ballots.map((ballot) => ballot.choice) : poll.votes.map((vote) => vote.choice ?? -1);
      const mine = votes.has(user.id);
      return {
        id: poll.id,
        question: poll.question,
        options: poll.options,
        secret: poll.secret,
        by: poll.createdBy,
        at: poll.createdAt.toISOString(),
        closedAt: poll.closedAt?.toISOString() ?? null,
        counts: pollCounts(poll.options.length, choices),
        voters: people.map((person) => ({
          ...person,
          voted: votes.has(person.id),
          choice: poll.secret ? null : (votes.get(person.id) ?? null),
        })),
        mine: { voted: mine, choice: poll.secret ? null : (votes.get(user.id) ?? null) },
        canVote: isVoter && !poll.closedAt && !(poll.secret && mine),
        canManage: access === 'write',
      };
    });
  }

  /** Νέα ψηφοφορία — το μαθαίνουν οι συμμετέχοντες. */
  async open(user: RequestUser, symvoulioId: string, input: NewPoll): Promise<{ id: string }> {
    if ((await this.access(user, symvoulioId)) !== 'write') throw new ForbiddenException('Ψηφοφορία ανοίγει όποιος γράφει το συμβούλιο.');
    const question = input.question.trim();
    if (!question) throw new BadRequestException('Γράψε την ερώτηση.');
    if (question.length > POLL_LIMITS.question) throw new BadRequestException(`Η ερώτηση ξεπερνά τους ${POLL_LIMITS.question} χαρακτήρες.`);
    const options = input.options?.length ? [...new Set(input.options.map((option) => option.trim()).filter(Boolean))] : [...POLL_YES_NO];
    if (options.length < 2) throw new BadRequestException('Χρειάζονται τουλάχιστον δύο επιλογές.');
    if (options.length > POLL_LIMITS.options || options.some((option) => option.length > POLL_LIMITS.option)) {
      throw new BadRequestException(`Ως ${POLL_LIMITS.options} επιλογές, ως ${POLL_LIMITS.option} χαρακτήρες η καθεμία.`);
    }
    const voters = await this.voterIds(symvoulioId);
    if (!voters.length) throw new BadRequestException('Δήλωσε πρώτα ποιοι συμμετέχουν — αυτοί ψηφίζουν.');

    const poll = await this.prisma.symvoulioPoll.create({
      data: { symvoulioId, question, options, secret: input.secret === true, createdById: user.id },
      select: { id: true },
    });
    const symvoulio = await this.prisma.symvoulio.findUnique({ where: { id: symvoulioId }, select: { title: true, drasiId: true } });
    void this.notifications.notify(
      voters.filter((id) => id !== user.id),
      {
        kind: 'poll',
        title: `Ψηφοφορία στο συμβούλιο «${symvoulio?.title?.trim() || 'χωρίς τίτλο'}»`,
        link: symvoulioLink({ id: symvoulioId, drasiId: symvoulio?.drasiId ?? null }),
      },
    );
    return poll;
  }

  /**
   * Η ψήφος ενός συμμετέχοντα. Στις επώνυμες αλλάζει όσο είναι ανοιχτή· στις
   * μυστικές μετράει μία φορά — το «τι» γράφεται χωρίς το «ποιος».
   */
  async vote(user: RequestUser, symvoulioId: string, pollId: string, choice: number): Promise<void> {
    await this.access(user, symvoulioId);
    const poll = await this.prisma.symvoulioPoll.findFirst({ where: { id: pollId, symvoulioId }, select: { id: true, options: true, secret: true, closedAt: true } });
    if (!poll) throw new NotFoundException('Η ψηφοφορία δεν βρέθηκε.');
    if (poll.closedAt) throw new ConflictException('Η ψηφοφορία έκλεισε.');
    if (!(await this.voterIds(symvoulioId)).includes(user.id)) throw new ForbiddenException('Ψηφίζουν οι συμμετέχοντες του συμβουλίου.');
    if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) throw new BadRequestException('Άκυρη επιλογή.');

    if (!poll.secret) {
      await this.prisma.symvoulioPollVote.upsert({
        where: { pollId_userId: { pollId, userId: user.id } },
        create: { pollId, userId: user.id, choice },
        update: { choice, votedAt: new Date() },
      });
      return;
    }
    // Μυστική: «ψήφισε» και «τι» σε δύο πίνακες, σε μία συναλλαγή — αν ψήφισε ήδη, τίποτα.
    try {
      await this.prisma.$transaction([
        this.prisma.symvoulioPollVote.create({ data: { pollId, userId: user.id, choice: null } }),
        this.prisma.symvoulioPollBallot.create({ data: { pollId, choice } }),
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Ψήφισες ήδη — η μυστική ψήφος δεν αλλάζει.');
      throw error;
    }
  }

  /** Κλείνει: το αποτέλεσμα μπαίνει στα πρακτικά, και το μαθαίνουν οι συμμετέχοντες. */
  async close(user: RequestUser, symvoulioId: string, pollId: string): Promise<void> {
    if ((await this.access(user, symvoulioId)) !== 'write') throw new ForbiddenException('Ψηφοφορία κλείνει όποιος γράφει το συμβούλιο.');
    await this.closeAndRecord(user, symvoulioId, pollId);
  }

  /** Πριν από την οριστικοποίηση: όσες είναι ανοιχτές κλείνουν, με το αποτέλεσμα στα πρακτικά. */
  async closeAllOpen(user: RequestUser, symvoulioId: string): Promise<void> {
    const open = await this.prisma.symvoulioPoll.findMany({ where: { symvoulioId, closedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    for (const poll of open) await this.closeAndRecord(user, symvoulioId, poll.id);
  }

  async remove(user: RequestUser, symvoulioId: string, pollId: string): Promise<void> {
    if ((await this.access(user, symvoulioId)) !== 'write') throw new ForbiddenException('Ψηφοφορία σβήνει όποιος γράφει το συμβούλιο.');
    await this.prisma.symvoulioPoll.deleteMany({ where: { id: pollId, symvoulioId } });
  }

  private async closeAndRecord(user: RequestUser, symvoulioId: string, pollId: string): Promise<void> {
    const closedAt = new Date();
    // Μία φορά: αν το κλείνουν δύο μαζί, γράφει ένας.
    const { count } = await this.prisma.symvoulioPoll.updateMany({ where: { id: pollId, symvoulioId, closedAt: null }, data: { closedAt } });
    if (!count) return;
    const poll = await this.prisma.symvoulioPoll.findUniqueOrThrow({
      where: { id: pollId },
      include: { votes: { select: { userId: true, choice: true } }, ballots: { select: { choice: true } }, symvoulio: { select: { title: true, drasiId: true } } },
    });
    const participants = await this.prisma.symvoulioParticipant.findMany({ where: { symvoulioId }, select: { user: PERSON } });
    const votes = new Map(poll.votes.map((vote) => [vote.userId, vote.choice]));
    const counts = pollCounts(poll.options.length, poll.secret ? poll.ballots.map((b) => b.choice) : poll.votes.map((v) => v.choice ?? -1));
    const text = pollResultText(
      { question: poll.question, options: poll.options, secret: poll.secret, closedAt },
      counts,
      participants.map(({ user: person }) => ({
        name: collabShortName(person.firstName, person.lastName),
        voted: votes.has(person.id),
        choice: poll.secret ? null : (votes.get(person.id) ?? null),
      })),
    );
    await this.appendToMinutes(user, symvoulioId, text);

    void this.notifications.notify(
      participants.map(({ user: person }) => person.id).filter((id) => id !== user.id),
      {
        kind: 'poll',
        title: `Έκλεισε η ψηφοφορία στο συμβούλιο «${poll.symvoulio.title?.trim() || 'χωρίς τίτλο'}»`,
        link: symvoulioLink({ id: symvoulioId, drasiId: poll.symvoulio.drasiId }),
      },
    );
  }

  /** Στο τέλος των πρακτικών — ως αλλαγή στο κοινό έγγραφο, για όσους γράφουν εκείνη τη στιγμή. */
  private async appendToMinutes(user: RequestUser, symvoulioId: string, text: string): Promise<void> {
    const connection = await this.collab.hocuspocus.openDirectConnection(collabDocument.symvoulio(symvoulioId), {
      requestId: 'poll',
      userId: user.id,
      user: { id: user.id, name: collabShortName(user.firstName, user.lastName), fullName: `${user.firstName} ${user.lastName}`, color: collabColor(user.id) },
    });
    try {
      await connection.transact((doc) => {
        const minutes = doc.getText('minutes');
        const current = minutes.toString();
        const gap = !current ? '' : current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
        minutes.insert(minutes.length, `${gap}${text}\n`);
      });
    } finally {
      await connection.disconnect();
    }
  }
}
