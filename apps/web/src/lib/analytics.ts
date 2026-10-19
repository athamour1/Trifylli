import { urlTemplate } from '@trifylli/shared';
import { UMAMI_URL, UMAMI_WEBSITE_ID } from './runtime-config';

/*
 * Ανώνυμα analytics (Umami, στον δικό μας server): σελίδες και χρόνοι, χωρίς
 * cookies και χωρίς στοιχεία λογαριασμού. Κάθε αποστολή περνά πρώτα από το
 * `beforeSend`: το URL γίνεται «μορφή» διαδρομής — χωρίς query, με τα tokens
 * των δημόσιων συνδέσμων και τα ids ως `:token`/`:id` (και ομαδοποιούνται οι
 * σελίδες: `/draseis/:id`, όχι μία γραμμή ανά δράση).
 */

interface UmamiPayload {
  url?: string;
  referrer?: string;
  [key: string]: unknown;
}

const BEFORE_SEND = '__trifylliUmamiBeforeSend';

export function umamiBeforeSend(_type: string, payload: UmamiPayload): UmamiPayload {
  return {
    ...payload,
    ...(payload.url ? { url: urlTemplate(payload.url) } : {}),
    ...(payload.referrer ? { referrer: urlTemplate(payload.referrer) } : {}),
  };
}

export function startAnalytics(): void {
  if (!UMAMI_URL || !UMAMI_WEBSITE_ID || document.querySelector('script[data-website-id]')) return;
  (window as unknown as Record<string, unknown>)[BEFORE_SEND] = umamiBeforeSend;
  const script = document.createElement('script');
  script.defer = true;
  script.src = `${UMAMI_URL}/script.js`;
  script.dataset.websiteId = UMAMI_WEBSITE_ID;
  script.dataset.hostUrl = UMAMI_URL;
  script.dataset.beforeSend = BEFORE_SEND;
  script.dataset.excludeSearch = 'true';
  script.dataset.excludeHash = 'true';
  document.head.appendChild(script);
}
