import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ApprovalStatus as Status } from '@prisma/client';
import {
  COMMENT_LIMITS,
  collabDocument,
  type ApprovalCompareView,
  type ApprovalStatus,
  type ApprovalSummaryRow,
  type ApprovalView,
  type CollabPerson,
} from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CollabApproval, CollabDocumentAbout, CollabDocumentType } from '../collab/collab-documents';
import { CollabHistoryService, sameContent } from '../collab/collab-history.service';
import { CollabService } from '../collab/collab.service';
import { CommentsService } from '../comments/comments.service';
import { NotificationsService } from '../notifications/notifications.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

interface Target {
  type: CollabDocumentType & { approval: CollabApproval };
  ids: string[];
  about: CollabDocumentAbout;
}

/**
 * Η έγκριση των προγραμματικών και των γευμάτων (συνεργασία, Φ11):
 * **Πρόχειρο → Για έλεγχο → Εγκρίθηκε**, και «Επιστροφή» με σχόλιο. Ζητά έλεγχο
 * όποιος γράφει το έγγραφο· εγκρίνουν ο Αρχηγός της δράσης και οι διαχειριστές
 * του κλάδου (ερώτημα 11). Η έγκριση κρατά ορόσημο στο ιστορικό· μια αλλαγή
 * μετά την έγκριση αφήνει το «Εγκρίθηκε», με σήμα και ειδοποίηση σε όποιον
 * ενέκρινε (ερώτημα 12).
 */
@Injectable()
export class ApprovalsService implements OnModuleInit {
  private readonly logger = new Logger('Approvals');

  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
    private readonly history: CollabHistoryService,
    private readonly notifications: NotificationsService,
    private readonly comments: CommentsService,
  ) {}

  onModuleInit(): void {
    this.collab.onDocumentWritten((name) => void this.written(name));
    this.collab.onRemoved(async (name, prefix) => {
      await this.prisma.docApproval.deleteMany({ where: { document: prefix ? { startsWith: name } : name } });
    });
  }

  /** Το έγγραφο, αν εγκρίνεται και αν το βλέπει ο χρήστης· αλλιώς «δεν βρέθηκε». */
  private async target(user: RequestUser, document: string): Promise<Target & { access: 'read' | 'write' }> {
    const target = this.collab.registry.resolve(document);
    const approval = target?.type.approval;
    const access = target && approval && target.type.about ? await this.collab.documentAccess(user, document) : null;
    const about = access ? await target!.type.about!(target!.ids) : null;
    if (!access || !about) throw new NotFoundException('Το έγγραφο δεν βρέθηκε.');
    return { type: target!.type as Target['type'], ids: target!.ids, about, access };
  }

  private async row(document: string) {
    return this.prisma.docApproval.findUnique({
      where: { document },
      include: { requestedBy: PERSON, decidedBy: PERSON },
    });
  }

  async state(user: RequestUser, document: string): Promise<ApprovalView> {
    const target = await this.target(user, document);
    const row = await this.row(document);
    return {
      document,
      status: (row?.status ?? Status.PROXEIRO) as ApprovalStatus,
      requestedBy: (row?.requestedBy as CollabPerson | null | undefined) ?? null,
      requestedAt: row?.requestedAt?.toISOString() ?? null,
      decidedBy: (row?.decidedBy as CollabPerson | null | undefined) ?? null,
      decidedAt: row?.decidedAt?.toISOString() ?? null,
      returnNote: row?.returnNote ?? null,
      changedAfter: row?.changedAfter ?? false,
      canRequest: target.access === 'write',
      canDecide: await target.type.approval.canDecide(user, target.ids),
    };
  }

  /** «Για έλεγχο» — από όποιον γράφει το έγγραφο. */
  async request(user: RequestUser, document: string, origin: string | null): Promise<void> {
    const target = await this.target(user, document);
    if (target.access !== 'write') throw new ForbiddenException('Για έλεγχο το στέλνει όποιος γράφει το έγγραφο.');
    const row = await this.row(document);
    if (row?.status === Status.ELEGXOS) return;
    if (row?.status === Status.EGKRITHIKE && !row.changedAfter) throw new BadRequestException('Έχει ήδη εγκριθεί.');
    await this.prisma.docApproval.upsert({
      where: { document },
      create: { document, status: Status.ELEGXOS, requestedById: user.id, requestedAt: new Date() },
      update: { status: Status.ELEGXOS, requestedById: user.id, requestedAt: new Date() },
    });
    this.changed(document, target, user, origin);
    const approvers = (await target.type.approval.approvers(target.ids)).filter((id) => id !== user.id);
    void this.notify(approvers, `Για έλεγχο ${target.about.title}`, target.about.link);
  }

  /** «Εγκρίθηκε» — ορόσημο στο ιστορικό, και το μαθαίνουν οι υπεύθυνοι και όποιος το έστειλε. */
  async approve(user: RequestUser, document: string, origin: string | null): Promise<void> {
    const target = await this.target(user, document);
    await this.assertDecides(user, target);
    const row = await this.row(document);
    // Ό,τι γράφτηκε ως τώρα σώζεται: εγκρίνεται το κείμενο που βλέπει.
    await this.collab.flush(document);
    const versionId = await this.history.milestone(document, 'Εγκρίθηκε');
    const decided = { status: Status.EGKRITHIKE, decidedById: user.id, decidedAt: new Date(), approvedVersionId: versionId, returnNote: null, changedAfter: false };
    await this.prisma.docApproval.upsert({ where: { document }, create: { document, ...decided }, update: decided });
    this.changed(document, target, user, origin);
    const told = [...target.about.watchers, ...(row?.requestedById ? [row.requestedById] : [])].filter((id) => id !== user.id);
    void this.notify(told, `Εγκρίθηκε ${target.about.title}`, target.about.link);
  }

  /** «Επιστροφή» με σχόλιο — πίσω στο πρόχειρο· το σχόλιο μπαίνει στα σχόλια του κειμένου. */
  async giveBack(user: RequestUser, document: string, note: string, origin: string | null): Promise<void> {
    const target = await this.target(user, document);
    await this.assertDecides(user, target);
    const text = note.trim();
    if (!text) throw new BadRequestException('Η επιστροφή θέλει σχόλιο — τι να διορθωθεί.');
    if (text.length > COMMENT_LIMITS.body) throw new BadRequestException(`Το σχόλιο ξεπερνά τους ${COMMENT_LIMITS.body} χαρακτήρες.`);
    const row = await this.row(document);
    const decided = { status: Status.PROXEIRO, decidedById: user.id, decidedAt: new Date(), returnNote: text, changedAfter: false };
    await this.prisma.docApproval.upsert({ where: { document }, create: { document, ...decided }, update: decided });
    // Η ειδοποίηση είναι η «Επιστροφή» — το σχόλιο δεν στέλνει δεύτερη.
    await this.comments.create(user, { document, field: target.type.approval.field, body: text }, origin, { notify: false });
    this.changed(document, target, user, origin);
    const told = [...target.about.watchers, ...(row?.requestedById ? [row.requestedById] : [])].filter((id) => id !== user.id);
    void this.notify(told, `Επιστροφή για διορθώσεις ${target.about.title}`, target.about.link);
  }

  /** Η εγκεκριμένη μορφή δίπλα στην τωρινή — για το «άλλαξε μετά την έγκριση». */
  async compare(user: RequestUser, document: string): Promise<ApprovalCompareView> {
    const target = await this.target(user, document);
    const row = await this.prisma.docApproval.findUnique({ where: { document }, select: { approvedVersionId: true } });
    const version = row?.approvedVersionId
      ? await this.prisma.collabVersion.findUnique({ where: { id: row.approvedVersionId }, select: { content: true, createdAt: true } })
      : null;
    const present = (content: unknown) => (content ? (target.type.present?.(content as Record<string, unknown>) ?? []) : []);
    return {
      approvedAt: version?.createdAt.toISOString() ?? null,
      approved: present(version?.content),
      current: present(await this.history.current(document)),
    };
  }

  /** Οι εγκρίσεις μιας δράσης — για την Επισκόπηση και το ωρολόγιο. */
  async summary(user: RequestUser, drasiId: string): Promise<ApprovalSummaryRow[]> {
    if (!UUID.test(drasiId) || !(await this.collab.documentAccess(user, collabDocument.drasiRoom(drasiId)))) {
      throw new NotFoundException('Η δράση δεν βρέθηκε.');
    }
    const rows = await this.prisma.docApproval.findMany({
      where: { document: { startsWith: collabDocument.drasiPrefix(drasiId) } },
      select: { document: true, status: true, changedAfter: true },
    });
    return rows.map((row) => ({ document: row.document, status: row.status as ApprovalStatus, changedAfter: row.changedAfter }));
  }

  // ───────────────────────── Βοηθητικά ─────────────────────────

  private async assertDecides(user: RequestUser, target: Target): Promise<void> {
    if (!(await target.type.approval.canDecide(user, target.ids))) {
      throw new ForbiddenException('Εγκρίνει ο Αρχηγός της δράσης ή διαχειριστής του κλάδου.');
    }
  }

  /** Ζωντανά: στο έγγραφο (η σελίδα του) και στο δωμάτιο της δράσης (ωρολόγιο, Επισκόπηση, ροή). */
  private changed(document: string, target: Target, user: RequestUser, origin: string | null): void {
    this.collab.broadcast(document, { topic: 'approval', by: user.id, origin });
    if (target.about.activity) {
      this.collab.apiChanged({ room: target.about.activity.room, topic: 'approvals', verb: 'change', by: user.id, origin });
    }
  }

  private async notify(userIds: string[], title: string, link: string): Promise<void> {
    if (userIds.length) await this.notifications.notify([...new Set(userIds)], { kind: 'approval', title, link });
  }

  /**
   * Γράφτηκε ένα εγκεκριμένο έγγραφο: διαφέρει από ό,τι εγκρίθηκε; Το σήμα
   * ανάβει (και ειδοποιείται όποιος ενέκρινε) μόνο την πρώτη φορά, και σβήνει
   * αν το κείμενο γυρίσει όπως εγκρίθηκε.
   */
  private async written(document: string): Promise<void> {
    try {
      const target = this.collab.registry.resolve(document);
      if (!target?.type.approval) return;
      const row = await this.prisma.docApproval.findUnique({
        where: { document },
        select: { status: true, changedAfter: true, approvedVersionId: true, decidedById: true },
      });
      if (row?.status !== Status.EGKRITHIKE || !row.approvedVersionId) return;
      const [version, current] = await Promise.all([
        this.prisma.collabVersion.findUnique({ where: { id: row.approvedVersionId }, select: { content: true } }),
        this.history.current(document),
      ]);
      if (!version || !current) return;
      const changed = !sameContent(version.content, current);
      if (changed === row.changedAfter) return;
      await this.prisma.docApproval.update({ where: { document }, data: { changedAfter: changed } });
      const about = await target.type.about?.(target.ids);
      if (about) this.collab.broadcast(document, { topic: 'approval', by: null, origin: null });
      if (about?.activity) this.collab.apiChanged({ room: about.activity.room, topic: 'approvals', verb: 'change', by: null, origin: null });
      if (changed && row.decidedById && about) await this.notify([row.decidedById], `Άλλαξε μετά την έγκριση ${about.title}`, about.link);
    } catch (error) {
      this.logger.warn({ event: 'approval-check-failed', document, message: (error as Error).message });
    }
  }
}
