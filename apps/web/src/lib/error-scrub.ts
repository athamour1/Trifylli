import type { ErrorEvent, EventHint } from '@sentry/vue';
import { scrubEmails, scrubUrlPath } from '@trifylli/shared';
import { ApiError, OfflineError } from './api';

/**
 * Τι αναφέρεται: σφάλματα του κώδικα και 5xx του API. ΟΧΙ τα αναμενόμενα —
 * ένα 403 «δεν έχετε δικαίωμα» ή ένα «εκτός σύνδεσης» στην κατασκήνωση δεν
 * είναι bug, και θα έπνιγαν τα πραγματικά.
 */
export function shouldReport(error: unknown): boolean {
  if (error instanceof OfflineError) return false;
  if (error instanceof ApiError) return error.status >= 500;
  return true;
}

/**
 * Ό,τι φεύγει από τον browser προς το error tracking. Η PWA δείχνει δεδομένα
 * παιδιών: κρατάμε τύπο, stack, URL χωρίς query και tokens, id λογαριασμού, και
 * το requestId του API (για να βρεθεί η γραμμή στα logs). Φεύγουν headers,
 * email/IP χρήστη, breadcrumbs· τα emails σε μηνύματα γίνονται `***@***`.
 */
export function prepareEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  const error = hint.originalException;
  if (!shouldReport(error)) return null;

  if (event.request) event.request = event.request.url ? { url: scrubUrlPath(event.request.url) } : {};
  if (event.user?.id) event.user = { id: String(event.user.id) };
  else delete event.user;
  delete event.breadcrumbs;
  if (event.message) event.message = scrubEmails(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubEmails(value.value);
  }
  if (error instanceof ApiError && error.requestId) event.tags = { ...event.tags, requestId: error.requestId };
  return event;
}
