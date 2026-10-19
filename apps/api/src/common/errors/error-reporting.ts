import * as Sentry from '@sentry/node';
import { requestContext } from '../logging/request-context';
import { extrasOptions, startExtras } from './error-reporting-extras';
import { scrubEvent } from './scrub-event';

let enabled = false;

/**
 * Error tracking (Sentry SDK → GlitchTip). Μόνο σφάλματα: χωρίς tracing, χωρίς
 * auto-instrumentation, χωρίς breadcrumbs — και κάθε event περνά από το
 * `scrubEvent`. Χωρίς `SENTRY_DSN` δεν κάνει τίποτα. Με `extras` προστίθενται
 * tracing, logs και breadcrumbs (`error-reporting-extras.ts`, ROADMAP §6).
 */
export function initErrorReporting(options: {
  dsn?: string;
  environment: string;
  release: string;
  extras?: { tracesSampleRate: number };
}): void {
  if (!options.dsn) return;
  const extras = options.extras ? extrasOptions(options.extras.tracesSampleRate) : undefined;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    // Οι προεπιλογές του v11 μαζεύουν ΠΟΛΛΑ (bodies, headers, cookies, query,
    // τοπικές μεταβλητές των frames, δεδομένα ερωτημάτων) — εδώ ζουν ιατρικά
    // παιδιών. Όλα κλειστά· ό,τι χρειάζεται για διάγνωση το λέει το requestId.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // Κανένα instrumentation: ούτε hooks που μετασχηματίζουν modules στο φόρτωμα
    // (το OpenTelemetry είναι ήδη κλειστό από προεπιλογή στο v11).
    enableRuntimeChannelInjection: false,
    defaultIntegrations: false,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.nodeContextIntegration(),
      Sentry.contextLinesIntegration(),
      ...(extras?.integrations ?? []),
    ],
    maxBreadcrumbs: 0,
    ...extras?.options,
    beforeSend: (event) => scrubEvent(event, { keepBreadcrumbs: !!extras }),
  });
  if (extras) startExtras();
  enabled = true;
}

/**
 * Στέλνει ένα σφάλμα με όσο πλαίσιο υπάρχει: requestId (από το αίτημα που
 * εξυπηρετείται), id λογαριασμού, ή το όνομα της εργασίας για τα crons.
 */
export function reportError(error: unknown, context: { userId?: string; job?: string } = {}): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    const requestId = requestContext.getStore()?.requestId;
    if (requestId) scope.setTag('requestId', requestId);
    if (context.job) scope.setTag('job', context.job);
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}
