import { defineBoot } from '#q-app/wrappers';
import { SENTRY_DSN } from '../lib/runtime-config';

/**
 * Error tracking, μόνο αν το `config.js` έχει DSN. Πρώτο boot, ώστε να πιάνει
 * σφάλματα και των επόμενων· το SDK έρχεται σε δικό του chunk, οπότε χωρίς DSN
 * δεν κατεβαίνει καν.
 */
export default defineBoot(({ app }) => {
  if (!SENTRY_DSN) return;
  void import('../lib/error-reporting').then(({ initErrorReporting }) => initErrorReporting(app, SENTRY_DSN));
});
