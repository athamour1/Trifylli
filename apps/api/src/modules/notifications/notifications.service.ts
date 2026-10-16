import { Inject, Injectable, Logger, NotFoundException, Optional, type OnModuleInit } from '@nestjs/common';
import {
  NOTIFICATION_KINDS,
  collabDocument,
  type NotificationKind,
  type NotificationsView,
} from '@trifylli/shared';
import webpush from 'web-push';
import type { RequestUser } from '../../common/auth/types';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollabService } from '../collab/collab.service';

/** Πόσες ειδοποιήσεις δείχνει το καμπανάκι. */
const INBOX_SIZE = 30;

/** Μία ειδοποίηση: τι και πού — ποτέ ονόματα παιδιών ή υγεία (ερώτημα 17). */
export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** Διαδρομή της εφαρμογής (π.χ. `/draseis/<id>/programma`). */
  link?: string | null;
}

/** Συσκευή για push, όπως τη γράφει ο browser. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Η αποστολή push — χωριστά, για να δοκιμάζεται χωρίς υπηρεσία push. */
export interface PushSender {
  readonly enabled: boolean;
  /** `gone` = η συσκευή δεν υπάρχει πια (404/410) και σβήνεται. */
  send(target: PushTarget, payload: string): Promise<'ok' | 'gone' | 'error'>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Web Push με κλειδιά VAPID (βλ. `gen-env`). Χωρίς κλειδιά δεν στέλνει τίποτα. */
export class WebPushSender implements PushSender {
  readonly enabled: boolean;

  constructor(config: Pick<AppConfig, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>) {
    this.enabled = !!(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
    if (this.enabled) {
      webpush.setVapidDetails(config.VAPID_SUBJECT ?? 'mailto:admin@localhost', config.VAPID_PUBLIC_KEY!, config.VAPID_PRIVATE_KEY!);
    }
  }

  async send(target: PushTarget, payload: string): Promise<'ok' | 'gone' | 'error'> {
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
        TTL: 3600,
        urgency: 'normal',
      });
      return 'ok';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? 'gone' : 'error';
    }
  }
}

/**
 * Οι ειδοποιήσεις (συνεργασία, Φ8): το καμπανάκι της εφαρμογής, ζωντανά στο
 * δωμάτιο του χρήστη (`user:<id>`), και push στις συσκευές που το έχουν ζητήσει.
 * Τα υπόλοιπα modules λένε μόνο «ειδοποίησε αυτούς» (`notify`).
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly collab: CollabService,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Optional() @Inject(AppConfigToken) private readonly config?: AppConfig,
  ) {}

  onModuleInit(): void {
    // Το δωμάτιο του χρήστη: μπαίνει μόνο ο ίδιος, και δεν έχει περιεχόμενο.
    this.collab.registry.register({
      kind: 'user',
      arity: 1,
      room: true,
      access: async (user, [userId]) => (user.id === userId ? 'read' : null),
      seed: async () => true,
      project: async () => undefined,
    });
  }

  /**
   * Ειδοποίησε αυτούς — όσους δεν έχουν κλείσει το είδος. Αποτυχία του push δεν
   * σταματά τίποτα. Οι καλούντες δεν το περιμένουν (`void notify(...)`).
   */
  async notify(userIds: readonly string[], input: NotificationInput): Promise<void> {
    const wanted = [...new Set(userIds)];
    if (!wanted.length) return;
    const muted = await this.prisma.notificationSetting.findMany({
      where: { userId: { in: wanted }, kind: input.kind, enabled: false },
      select: { userId: true },
    });
    const off = new Set(muted.map((m) => m.userId));
    const recipients = wanted.filter((userId) => !off.has(userId));
    if (!recipients.length) return;

    await this.prisma.notification.createMany({
      data: recipients.map((userId) => ({ userId, kind: input.kind, title: input.title, body: input.body ?? null, link: input.link ?? null })),
    });
    for (const userId of recipients) {
      this.collab.broadcast(collabDocument.user(userId), { topic: 'notifications', by: null, origin: null });
    }
    // Όποιος καλεί το `notify` δεν το περιμένει (το αίτημα του χρήστη δεν καθυστερεί).
    try {
      await this.sendPush(recipients, input);
    } catch (error) {
      this.logger.warn({ event: 'push-failed', message: (error as Error).message });
    }
  }

  private async sendPush(userIds: string[], input: NotificationInput): Promise<void> {
    if (!this.push.enabled) return;
    const targets = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    const payload = JSON.stringify({ title: input.title, body: input.body ?? '', link: input.link ?? '/' });
    const results = await Promise.all(targets.map(async (target) => [target.endpoint, await this.push.send(target, payload)] as const));
    const gone = results.filter(([, result]) => result === 'gone').map(([endpoint]) => endpoint);
    if (gone.length) await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: gone } } });
    const failed = results.filter(([, result]) => result === 'error').length;
    if (failed) this.logger.warn({ event: 'push-failed', count: failed });
  }

  async list(user: RequestUser): Promise<NotificationsView> {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: INBOX_SIZE,
        select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return {
      unread,
      items: items.map((item) => ({
        ...item,
        body: item.body ?? null,
        link: item.link ?? null,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  async markRead(user: RequestUser, id: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    this.collab.broadcast(collabDocument.user(user.id), { topic: 'notifications', by: user.id, origin: null });
  }

  async markAllRead(user: RequestUser): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    this.collab.broadcast(collabDocument.user(user.id), { topic: 'notifications', by: user.id, origin: null });
  }

  // ───────────────────────── Ρυθμίσεις & συσκευές ─────────────────────────

  /** Κάθε είδος, ανοιχτό ή κλειστό. */
  async settings(user: RequestUser): Promise<{ kind: NotificationKind; label: string; enabled: boolean }[]> {
    const rows = await this.prisma.notificationSetting.findMany({ where: { userId: user.id }, select: { kind: true, enabled: true } });
    const byKind = new Map(rows.map((row) => [row.kind, row.enabled]));
    return (Object.keys(NOTIFICATION_KINDS) as NotificationKind[]).map((kind) => ({
      kind,
      label: NOTIFICATION_KINDS[kind],
      enabled: byKind.get(kind) ?? true,
    }));
  }

  async setSetting(user: RequestUser, kind: NotificationKind, enabled: boolean): Promise<void> {
    if (!(kind in NOTIFICATION_KINDS)) throw new NotFoundException('Άγνωστο είδος ειδοποίησης.');
    await this.prisma.notificationSetting.upsert({
      where: { userId_kind: { userId: user.id, kind } },
      create: { userId: user.id, kind, enabled },
      update: { enabled },
    });
  }

  /** Το δημόσιο κλειδί VAPID — `null` όταν το push δεν είναι ρυθμισμένο στον server. */
  pushKey(): { publicKey: string | null } {
    return { publicKey: this.push.enabled ? (this.config?.VAPID_PUBLIC_KEY ?? null) : null };
  }

  /** Η συσκευή γράφεται για push — αν ήταν άλλου χρήστη (κοινή συσκευή), περνά σε αυτόν. */
  async subscribe(user: RequestUser, target: PushTarget): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: target.endpoint },
      create: { userId: user.id, ...target },
      update: { userId: user.id, p256dh: target.p256dh, auth: target.auth, lastUsedAt: new Date() },
    });
  }

  /** Η συσκευή δεν θέλει πια push (ή αποσυνδέεται ο χρήστης). */
  async unsubscribe(user: RequestUser, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  }
}
