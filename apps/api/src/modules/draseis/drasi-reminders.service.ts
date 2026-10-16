import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DrasiStatus, Prisma } from '@prisma/client';
import { JobMonitor } from '../../common/jobs/job-monitor';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DraseisPlanService, localDate } from './draseis-plan.service';
import { REMINDER_LEAD_MIN, remindersDue } from './schedule-delays';

/** Πόσο γύρω από τις ημερομηνίες της δράσης κοιτάμε (ζώνες ώρας, στοιχεία μετά τα μεσάνυχτα). */
const AROUND_MS = 36 * 3_600_000;

/**
 * Οι υπενθυμίσεις του προγράμματος (συνεργασία, Φ12): «Σε 10΄ αρχίζει
 * «Πεζοπορία»» στους υπευθύνους του στοιχείου, με τις **διορθωμένες** ώρες
 * (μετά από καθυστέρηση). Κλείνουν από τις ρυθμίσεις (είδος `reminder`).
 */
@Injectable()
export class DrasiRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plan: DraseisPlanService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobMonitor,
  ) {}

  /** Κάθε λεπτό. */
  @Cron('* * * * *')
  async remind(): Promise<void> {
    const run = this.jobs.start('drasi-reminders');
    const sent = await this.sendDue(new Date(), (error, drasiId) => run.fail(error, drasiId));
    await run.finish(`${sent} υπενθυμίσεις`);
  }

  /** Στέλνει όσες είναι της ώρας — μία φορά η καθεμία. Επιστρέφει πόσες έφυγαν. */
  async sendDue(now: Date, onError: (error: unknown, drasiId: string) => void = () => undefined): Promise<number> {
    const drasis = await this.prisma.drasi.findMany({
      where: {
        status: DrasiStatus.ENERGI,
        archivedAt: null,
        dateStart: { lte: new Date(now.getTime() + AROUND_MS) },
        dateEnd: { gte: new Date(now.getTime() - AROUND_MS) },
      },
      select: { id: true, title: true, dateStart: true, dateEnd: true, dayStartTimes: true, topiko: { select: { timezone: true } } },
    });
    let sent = 0;
    for (const drasi of drasis) {
      try {
        sent += await this.remindDrasi(drasi, now);
      } catch (error) {
        onError(error, drasi.id);
      }
    }
    return sent;
  }

  private async remindDrasi(
    drasi: { id: string; title: string; dateStart: Date; dateEnd: Date; dayStartTimes: Prisma.JsonValue | null; topiko: { timezone: string | null } },
    now: Date,
  ): Promise<number> {
    const tz = drasi.topiko.timezone ?? 'Europe/Athens';
    // Σήμερα και αύριο: ένα στοιχείο στις 00:05 θυμίζεται στις 23:55.
    const wanted = new Set([localDate(now, tz), localDate(new Date(now.getTime() + REMINDER_LEAD_MIN * 60_000 + 60_000), tz)]);
    const days = await this.plan.days(drasi, tz);
    const items = days
      .filter((day) => wanted.has(day.date))
      .flatMap((day) => day.items)
      .map((item) => ({ ...item, startsAt: new Date(item.startsAt) }));

    let sent = 0;
    for (const item of remindersDue(items, now)) {
      if (!item.responsibles.length) continue;
      // Μία φορά ανά στοιχείο και ώρα έναρξης — και με δύο API (ή επανεκκίνηση) στη μέση.
      try {
        await this.prisma.drasiReminder.create({ data: { itemId: item.id, startsAt: item.startsAt } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
      await this.notifications.notify(
        item.responsibles.map((person) => person.id),
        {
          kind: 'reminder',
          title: `Σε ${REMINDER_LEAD_MIN}΄ αρχίζει «${item.title}» — δράση «${drasi.title}» · έχεις την ευθύνη`,
          link: `/draseis/${drasi.id}/programma/${item.id}`,
        },
      );
      sent += 1;
    }
    return sent;
  }
}
