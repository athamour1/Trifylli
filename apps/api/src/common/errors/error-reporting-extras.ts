import * as Sentry from '@sentry/node';
import type { Breadcrumb, Event, Log, NodeOptions } from '@sentry/node';
import { scrubText, scrubUrlPath, urlTemplate } from '@trifylli/shared';
import { setLogSink, type LogSink } from '../logging/app-logger';
import { scrubEvent } from './scrub-event';

/*
 * Τα «extras» του error tracking όσο το σύστημα είναι σε ενεργή ανάπτυξη
 * (`SENTRY_EXTRAS`): tracing (αιτήματα, Prisma, κλήσεις προς τα έξω), logs στο
 * GlitchTip, breadcrumbs. ΔΕΝ μένουν στην κανονική παραγωγή — ROADMAP §6: όταν
 * έρθει η ώρα, σβήνεται αυτό το αρχείο και η κλήση του στο `error-reporting.ts`.
 *
 * Ο ίδιος κανόνας με τα σφάλματα: τίποτα από bodies, headers, cookies, query·
 * URL χωρίς tokens, emails ως `***@***`. Τα SQL των spans είναι παραμετρικά
 * (`$1`) — οι τιμές μένουν εκτός (`dataCollection.databaseQueryData: false`).
 */

/** Ο Docker healthcheck και οι αναφορές CSP — θόρυβος χωρίς πληροφορία στο tracing. */
const QUIET_PATHS = /^\/[^/]+\/(health(\/ready)?|csp-report)$/;

/** Κλειδιά δεδομένων (spans/breadcrumbs) που κουβαλούν query ή fragment. */
const DROPPED_KEYS = new Set(['url.query', 'http.query', 'url.fragment', 'http.fragment']);

function scrubData<T extends Record<string, unknown>>(data: T | undefined): T | undefined {
  if (!data) return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (DROPPED_KEYS.has(key)) continue;
    out[key] = typeof value === 'string' ? scrubText(value) : value;
  }
  return out as T;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: scrubText(breadcrumb.message) } : {}),
    ...(breadcrumb.data ? { data: scrubData(breadcrumb.data) } : {}),
  };
}

/** Μια συναλλαγή: όνομα ως «μορφή» διαδρομής (`/api/draseis/:id`) και καθαρά spans. */
export function scrubTransaction<E extends Event>(event: E): E {
  const out = scrubEvent(event, { keepBreadcrumbs: true });
  if (out.transaction) out.transaction = urlTemplate(out.transaction);
  for (const span of out.spans ?? []) {
    if (span.description) span.description = scrubText(span.description);
    span.data = scrubData(span.data) ?? {};
  }
  return out;
}

export function scrubLog(log: Log): Log {
  const attributes = log.attributes ? scrubData(log.attributes as Record<string, unknown>) : undefined;
  return {
    ...log,
    message: scrubText(String(log.message)),
    ...(attributes ? { attributes: attributes as Log['attributes'] } : {}),
  };
}

/** Από μια γραμμή του Nest logger σε log του GlitchTip· τα αντικείμενα (π.χ. η γραμμή αιτήματος) γίνονται attributes. */
export const forwardLog: LogSink = ({ level, message, context, requestId }) => {
  const attributes: Record<string, string | number | boolean> = {};
  if (context) attributes.context = context;
  if (requestId) attributes.requestId = requestId;
  let body: string;
  if (message !== null && typeof message === 'object' && !(message instanceof Error)) {
    for (const [key, value] of Object.entries(message)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') attributes[key] = value;
    }
    body = JSON.stringify(message);
  } else {
    body = message instanceof Error ? message.message : String(message);
  }
  if (level === 'error' || level === 'fatal') Sentry.logger.error(body, attributes);
  else if (level === 'warn') Sentry.logger.warn(body, attributes);
  else if (level === 'debug' || level === 'verbose') Sentry.logger.debug(body, attributes);
  else Sentry.logger.info(body, attributes);
};

type Integration = Extract<NonNullable<NodeOptions['integrations']>, unknown[]>[number];

/** Ό,τι προστίθεται στο `Sentry.init` όταν τα extras είναι ανοιχτά. */
export function extrasOptions(tracesSampleRate: number): {
  integrations: Integration[];
  options: Pick<
    NodeOptions,
    | 'tracesSampleRate'
    | 'ignoreSpans'
    | 'traceLifecycle'
    | 'maxBreadcrumbs'
    | 'beforeBreadcrumb'
    | 'beforeSendTransaction'
    | 'beforeSendLog'
  >;
} {
  return {
    integrations: [
      Sentry.httpIntegration({
        // Το GlitchTip δεν κρατά sessions.
        sessions: false,
        maxRequestBodySize: 'none',
        ignoreIncomingRequests: (urlPath) => QUIET_PATHS.test(urlPath),
      }),
      Sentry.nativeNodeFetchIntegration(),
      Sentry.prismaIntegration(),
    ],
    options: {
      tracesSampleRate,
      // Η εκκίνηση του Prisma βγάζει δικές της «συναλλαγές» χωρίς αίτημα — θόρυβος.
      ignoreSpans: [/^prisma:client:(detect_platform|load_engine|connect)$/],
      // Το GlitchTip δέχεται συναλλαγές (static), όχι το «span streaming» που είναι
      // η προεπιλογή του SDK v11.
      traceLifecycle: 'static',
      maxBreadcrumbs: 50,
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
      beforeSendTransaction: (event) => scrubTransaction(event),
      beforeSendLog: (log) => scrubLog(log),
    },
  };
}

/** Μετά το `Sentry.init`: τα logs του Nest πάνε και στο GlitchTip. */
export function startExtras(): void {
  setLogSink(forwardLog);
}
