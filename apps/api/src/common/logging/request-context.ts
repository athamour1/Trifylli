import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { scrubUrlPath } from '@trifylli/shared';

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

/**
 * Η διαδρομή όπως γράφεται στα logs: χωρίς query string και με τα tokens ως
 * `:token` — ίδιος κανόνας με το error tracking (`scrubUrlPath` στο shared).
 */
export function loggablePath(originalUrl: string): string {
  return scrubUrlPath(originalUrl);
}
