import type { App } from 'vue';
import * as Sentry from '@sentry/vue';
import { prepareEvent } from './error-scrub';
import { onReportingUser } from './reporting-user';

/**
 * Error tracking της PWA (Sentry SDK → GlitchTip). Φορτώνεται σε δικό του chunk
 * και μόνο αν υπάρχει DSN. Μόνο σφάλματα: χωρίς tracing, χωρίς replay, χωρίς
 * breadcrumbs, χωρίς props των components (`attachProps: false` — εκεί ζουν
 * δεδομένα παιδιών)· κάθε event περνά από το `prepareEvent`.
 */
export function initErrorReporting(app: App, dsn: string): void {
  Sentry.init({
    dsn,
    release: `trifylli-web@${process.env.APP_VERSION ?? 'dev'}`,
    environment: process.env.DEV ? 'development' : 'production',
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
    beforeSend: prepareEvent,
  });
  onReportingUser((id) => Sentry.setUser(id ? { id } : null));
}
