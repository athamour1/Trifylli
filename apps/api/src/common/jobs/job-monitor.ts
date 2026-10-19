import { Logger } from '@nestjs/common';
import { scrubEmails } from '@trifylli/shared';
import { reportError } from '../errors/error-reporting';

/** Οι περιοδικές εργασίες του API που στέλνουν heartbeat (βλ. docs/monitoring.md). */
export type JobName = 'eseo-sync' | 'health-purge' | 'image-sweep' | 'pharmacy-returns' | 'pharmacy-access' | 'drasi-reminders';

export interface HeartbeatRequest {
  url: string;
  body?: string;
}

/**
 * Το αίτημα ενός heartbeat — ίδια αντιστοίχιση με το `infra/config/heartbeat.sh`:
 *   Healthchecks (healthchecks.io ή self-hosted): επιτυχία στο URL, αποτυχία στο
 *   `/fail`, το μήνυμα στο body.
 *   Uptime Kuma (push monitor — `/api/push/<token>`): `status=up|down` και `msg`
 *   στο query.
 *   GlitchTip (heartbeat monitor — `/heartbeat_check/<id>/`): μόνο επιτυχία. Δεν
 *   έχει «αποτυχία»· η σιωπή είναι η αποτυχία (alert όταν περάσει το διάστημα),
 *   και το ίδιο το σφάλμα έχει ήδη πάει στο error tracking. `null` = κανένα αίτημα.
 */
export function heartbeatRequest(url: string, ok: boolean, message?: string): HeartbeatRequest | null {
  if (url.includes('/heartbeat_check/')) return ok ? { url } : null;
  if (url.includes('/api/push/')) {
    const target = new URL(url);
    target.searchParams.set('status', ok ? 'up' : 'down');
    if (message) target.searchParams.set('msg', message.slice(0, 200));
    return { url: target.toString() };
  }
  const target = ok ? url : `${url.replace(/\/+$/, '')}/fail`;
  return message ? { url: target, body: message } : { url: target };
}

export type HeartbeatSender = (request: HeartbeatRequest) => Promise<void>;

const fetchSender: HeartbeatSender = async ({ url, body }) => {
  const response = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
};

/**
 * Παρακολούθηση των crons. Τα crons πιάνουν τα σφάλματα ανά στοιχείο (ένα Τοπικό,
 * ένα φαρμακείο) ώστε το ένα να μη σταματά τα άλλα — άρα ένα try/catch γύρω τους
 * δεν βλέπει ποτέ αποτυχία. Εδώ το cron ξεκινά μια εκτέλεση, σημειώνει κάθε
 * αποτυχία (πάει και στο error tracking) και στο τέλος στέλνει ok ή fail.
 */
export class JobMonitor {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly urls: Partial<Record<JobName, string | undefined>>,
    private readonly send: HeartbeatSender = fetchSender,
  ) {}

  start(job: JobName): JobRun {
    return new JobRun(job, this.urls[job], this.send, this.logger);
  }

  /** Για crons χωρίς δικά τους try/catch: ok με την περίληψη, ή fail και το σφάλμα ξανά. */
  async track<T>(job: JobName, fn: () => Promise<T>, summarize?: (result: T) => string): Promise<T> {
    const run = this.start(job);
    try {
      const result = await fn();
      await run.finish(summarize?.(result));
      return result;
    } catch (error) {
      run.fail(error);
      await run.finish();
      throw error;
    }
  }
}

export class JobRun {
  private readonly failures: string[] = [];

  constructor(
    private readonly job: JobName,
    private readonly url: string | undefined,
    private readonly send: HeartbeatSender,
    private readonly logger: Logger,
  ) {}

  fail(error: unknown, what?: string): void {
    const message = error instanceof Error ? error.message : String(error);
    this.failures.push(what ? `${what}: ${message}` : message);
    reportError(error, { job: this.job });
  }

  /** Ένα ping που αποτυγχάνει γράφεται στα logs· δεν ρίχνει ποτέ το cron. */
  async finish(summary?: string): Promise<void> {
    if (!this.url) return;
    const lines = [...this.failures, ...(summary ? [summary] : [])];
    const message = lines.length ? scrubEmails(lines.join('\n')) : undefined;
    const request = heartbeatRequest(this.url, this.failures.length === 0, message);
    if (!request) return;
    try {
      await this.send(request);
    } catch (error) {
      this.logger.warn(`Heartbeat ${this.job}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
