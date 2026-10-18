import { ref } from 'vue';
import { useQuasar } from 'quasar';
import type { LinkEmailResult } from '@trifylli/shared';
import { ApiError, post } from '../lib/api';
import { linkToken, type LinkEmailState } from '../lib/link-email';

/**
 * Αποστολή με email των συνδέσμων που μόλις εκδόθηκαν (έντυπα, αξιολόγηση).
 * Οι παραλήπτες βγαίνουν στον server (όποιος υπογράφει)· εδώ μένει μόνο τι
 * έγινε με τον καθένα, για να μη σταλεί δεύτερη φορά κατά λάθος.
 */
export function useLinkEmails(endpoint: () => string) {
  const $q = useQuasar();
  const state = ref<Record<string, LinkEmailState>>({});

  const canSend = (id: string): boolean => state.value[id]?.status !== 'sent' && state.value[id]?.status !== 'sending';

  async function send(links: readonly { id: string; url: string }[]): Promise<void> {
    const pending = links.filter((l) => canSend(l.id));
    if (!pending.length) return;
    for (const l of pending) state.value[l.id] = { status: 'sending' };
    try {
      const results = await post<LinkEmailResult[]>(endpoint(), { links: pending.map((l) => ({ id: l.id, token: linkToken(l.url) })) });
      for (const r of results) state.value[r.id] = r.sent ? { status: 'sent', to: r.to } : { status: 'error', error: r.error ?? 'Δεν στάλθηκε.' };
      const sent = results.filter((r) => r.sent).length;
      const failed = results.length - sent;
      $q.notify(
        failed
          ? { type: 'warning', message: sent ? `Στάλθηκαν ${sent} — ${failed} όχι (δες τη λεζάντα τους).` : 'Δεν στάλθηκε — δες τη λεζάντα.' }
          : { type: 'positive', message: sent === 1 ? 'Το email στάλθηκε.' : `Στάλθηκαν ${sent} email.` },
      );
    } catch (err) {
      const error = err instanceof ApiError ? err.message : 'Το email δεν έφυγε — δοκίμασε ξανά.';
      for (const l of pending) state.value[l.id] = { status: 'error', error };
      $q.notify({ type: 'negative', message: error });
    }
  }

  function reset(): void {
    state.value = {};
  }

  return { state, canSend, send, reset };
}
