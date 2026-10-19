import * as Sentry from '@sentry/vue';
import type { Breadcrumb, BrowserOptions, Event, Log } from '@sentry/vue';
import type { Router } from 'vue-router';
import { scrubEmails, scrubText, scrubUrlPath, urlTemplate } from '@trifylli/shared';
import { setFeedbackSender } from './feedback';

/*
 * Τα «extras» του error tracking της PWA όσο το σύστημα είναι σε ενεργή
 * ανάπτυξη (`sentryExtras` στο config.js): tracing σελίδων και κλήσεων προς το
 * API (με συνέχεια στο tracing του API), breadcrumbs, warn/error της κονσόλας
 * ως logs, «Αναφορά προβλήματος». ΔΕΝ μένουν στην κανονική παραγωγή — ROADMAP
 * §6: τότε σβήνεται αυτό το αρχείο και η κλήση του στο `error-reporting.ts`.
 *
 * Ο ίδιος κανόνας με τα σφάλματα: URL χωρίς query και tokens, emails ως
 * `***@***`, κανένα όρισμα της κονσόλας (εκεί καταλήγουν αντικείμενα με
 * δεδομένα μελών), καμία τιμή φόρμας.
 */

/** Κλειδιά δεδομένων (spans/breadcrumbs) που κουβαλούν query, fragment ή ορίσματα. */
const DROPPED_KEYS = new Set(['url.query', 'http.query', 'url.fragment', 'http.fragment', 'arguments']);

type Integration = Extract<NonNullable<BrowserOptions['integrations']>, unknown[]>[number];

function scrubData<T extends Record<string, unknown>>(data: T): T {
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

/** Μια συναλλαγή: όνομα ως «μορφή» διαδρομής, καθαρά spans, μόνο το id του χρήστη. */
export function scrubTransaction<E extends Event>(event: E): E {
  if (event.transaction) event.transaction = urlTemplate(event.transaction);
  if (event.request) event.request = event.request.url ? { url: scrubUrlPath(event.request.url) } : {};
  if (event.user?.id) event.user = { id: String(event.user.id) };
  else delete event.user;
  for (const span of event.spans ?? []) {
    if (span.description) span.description = scrubText(span.description);
    span.data = scrubData(span.data ?? {});
  }
  return event;
}

const CONSOLE_ORIGIN = 'auto.log.console';

/**
 * Ένα log. Από την κονσόλα κρατάμε μόνο το κείμενο (το πρότυπο, ή την πρώτη
 * γραμμή): τα ορίσματα — συχνά ολόκληρα αντικείμενα με δεδομένα μελών — φεύγουν.
 */
export function scrubLog(log: Log): Log {
  const attributes = log.attributes ?? {};
  if (attributes['sentry.origin'] === CONSOLE_ORIGIN) {
    const template = attributes['sentry.message.template'];
    const text = typeof template === 'string' ? template : (String(log.message).split('\n')[0] ?? '');
    return { ...log, message: scrubText(text.slice(0, 300)), attributes: { 'sentry.origin': CONSOLE_ORIGIN } };
  }
  const out: Log = { ...log, message: scrubText(String(log.message)) };
  if (log.attributes) out.attributes = scrubData(log.attributes);
  return out;
}

/** Ό,τι προστίθεται στο `Sentry.init` όταν τα extras είναι ανοιχτά. */
export function extrasOptions(
  router: Router,
  options: { apiUrl: string; tracesSampleRate: number },
): {
  integrations: Integration[];
  options: Pick<
    BrowserOptions,
    | 'tracesSampleRate'
    | 'traceLifecycle'
    | 'tracePropagationTargets'
    | 'maxBreadcrumbs'
    | 'beforeBreadcrumb'
    | 'beforeSendTransaction'
    | 'beforeSendLog'
  >;
} {
  return {
    integrations: [
      // Ονόματα συναλλαγών από τη διαδρομή του router (`/draseis/:id`), όχι το URL.
      Sentry.browserTracingIntegration({ router, routeLabel: 'path' }),
      Sentry.breadcrumbsIntegration({ dom: true, fetch: true, history: true, xhr: true }),
      Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
    ],
    options: {
      tracesSampleRate: options.tracesSampleRate,
      // Το GlitchTip δέχεται συναλλαγές (static), όχι το «span streaming» του SDK v11.
      traceLifecycle: 'static',
      // `sentry-trace`/`baggage` μόνο προς το API μας — όχι στο Authentik ή αλλού.
      tracePropagationTargets: [options.apiUrl],
      maxBreadcrumbs: 50,
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
      beforeSendTransaction: (event) => scrubTransaction(event),
      beforeSendLog: (log) => scrubLog(log),
    },
  };
}

/** Μετά το `Sentry.init`: η «Αναφορά προβλήματος» γίνεται διαθέσιμη στο μενού. */
export function startExtras(): void {
  setFeedbackSender((message) => {
    Sentry.captureFeedback({ message: scrubEmails(message), url: scrubUrlPath(window.location.href) });
  });
}
