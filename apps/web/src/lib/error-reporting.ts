import type { App } from 'vue';
import type { Router } from 'vue-router';
import * as Sentry from '@sentry/vue';
import { extrasOptions, startExtras } from './error-reporting-extras';
import { prepareEvent } from './error-scrub';
import { onReplayUrl } from './replay-link';
import { onReportingUser } from './reporting-user';

/**
 * Error tracking της PWA (Sentry SDK → GlitchTip). Φορτώνεται σε δικό του chunk
 * και μόνο αν υπάρχει DSN. Μόνο σφάλματα: χωρίς tracing, χωρίς replay, χωρίς
 * breadcrumbs, χωρίς props των components (`attachProps: false` — εκεί ζουν
 * δεδομένα παιδιών)· κάθε event περνά από το `prepareEvent`. Με `extras`
 * προστίθενται tracing, breadcrumbs, logs και «Αναφορά προβλήματος»
 * (`error-reporting-extras.ts`, ROADMAP §6).
 */
export function initErrorReporting(
  app: App,
  options: {
    dsn: string;
    environment: string;
    router: Router;
    extras?: { apiUrl: string; tracesSampleRate: number };
  },
): void {
  const extras = options.extras ? extrasOptions(options.router, options.extras) : undefined;
  Sentry.init({
    dsn: options.dsn,
    release: `trifylli-web@${process.env.APP_VERSION ?? 'dev'}`,
    environment: options.environment,
    defaultIntegrations: false,
    integrations: [
      Sentry.vueIntegration({ app, attachProps: false }),
      Sentry.globalHandlersIntegration(),
      Sentry.browserApiErrorsIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.eventFiltersIntegration(),
      Sentry.httpContextIntegration(),
      ...(extras?.integrations ?? []),
    ],
    maxBreadcrumbs: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    ...extras?.options,
    beforeSend: (event, hint) => prepareEvent(event, hint, { keepBreadcrumbs: !!extras }),
  });
  onReportingUser((id) => Sentry.setUser(id ? { id } : null));
  // Από το issue στο replay της ίδιας συνεδρίας (OpenReplay, ROADMAP §6).
  onReplayUrl((url) => Sentry.setTag('openreplay', url ?? undefined));
  if (extras) startExtras();
}
