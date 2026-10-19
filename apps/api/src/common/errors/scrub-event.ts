import type { Event } from '@sentry/node';
import { scrubEmails, scrubUrlPath } from '@trifylli/shared';

/**
 * Ό,τι φεύγει προς το error tracking. Το API χειρίζεται δεδομένα παιδιών (υγεία,
 * κηδεμόνες), οπότε κρατάμε μόνο όσα χρειάζονται για να βρεις το σφάλμα: τύπο,
 * stack, μέθοδο και διαδρομή χωρίς query και tokens, id λογαριασμού, requestId
 * (tag). Φεύγουν: body, cookies, headers, email/IP/όνομα χρήστη, breadcrumbs —
 * το πλαίσιο υπάρχει στα logs, μέσω του requestId. Τα emails σε μηνύματα
 * σφαλμάτων γίνονται `***@***`.
 */
export function scrubEvent<E extends Event>(event: E, options: { keepBreadcrumbs?: boolean } = {}): E {
  if (event.request) {
    const { method, url } = event.request;
    event.request = { ...(method ? { method } : {}), ...(url ? { url: scrubUrlPath(url) } : {}) };
  }
  if (event.user?.id) event.user = { id: String(event.user.id) };
  else delete event.user;
  // Με τα extras (ROADMAP §6) τα breadcrumbs μένουν — έχουν ήδη περάσει από το
  // `scrubBreadcrumb` όταν γράφτηκαν.
  if (!options.keepBreadcrumbs) delete event.breadcrumbs;
  if (event.message) event.message = scrubEmails(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubEmails(value.value);
  }
  return event;
}
