import { defineBoot } from '#q-app/wrappers';
import { API_URL, SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_EXTRAS, SENTRY_TRACES_SAMPLE_RATE } from '../lib/runtime-config';

/**
 * Error tracking, μόνο αν το `config.js` έχει DSN. Πρώτο boot, ώστε να πιάνει
 * σφάλματα και των επόμενων· το SDK έρχεται σε δικό του chunk, οπότε χωρίς DSN
 * δεν κατεβαίνει καν.
 */
export default defineBoot(({ app, router }) => {
  if (!SENTRY_DSN) return;
  void import('../lib/error-reporting').then(({ initErrorReporting }) =>
    initErrorReporting(app, {
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      router,
      ...(SENTRY_EXTRAS ? { extras: { apiUrl: API_URL, tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE } } : {}),
    }),
  );
});
