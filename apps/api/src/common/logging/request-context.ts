import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Ό,τι ξέρουμε για το αίτημα που εξυπηρετείται τώρα. Ζει σε AsyncLocalStorage,
 * ώστε να φτάνει σε κάθε log (και στο error tracking) χωρίς να περνά από χέρι
 * σε χέρι μέσα από services.
 */
export interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Ένα `X-Request-Id` από τον proxy κρατιέται μόνο αν μοιάζει με id· αλλιώς δικό μας. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export function resolveRequestId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && SAFE_REQUEST_ID.test(value) ? value : randomUUID();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Αδιαφανές, μακρύ τμήμα διαδρομής — τα tokens των δημόσιων συνδέσμων (έντυπα, αξιολόγηση). */
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;

/**
 * Η διαδρομή όπως γράφεται στα logs: χωρίς query string και με τα tokens ως
 * `:token`. Ένα token σε log είναι ένας σύνδεσμος προς το έντυπο υγείας ενός
 * παιδιού για όποιον διαβάζει τα logs. Τα UUID μένουν — δείχνουν ποια δράση.
 */
export function loggablePath(originalUrl: string): string {
  const path = originalUrl.split('?')[0] ?? '';
  return path
    .split('/')
    .map((segment) => (OPAQUE_SEGMENT.test(segment) && !UUID.test(segment) ? ':token' : segment))
    .join('/');
}
