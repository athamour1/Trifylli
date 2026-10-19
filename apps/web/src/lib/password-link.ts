import type { QVueGlobals } from 'quasar';
import { ApiError, post } from './api';

/**
 * Σύνδεσμος ορισμού κωδικού από το Authentik: το ίδιο email για πρόσκληση που
 * χάθηκε και για κωδικό που ξεχάστηκε — αλλάζει μόνο η ονομασία. Ρωτά πρώτα.
 * Ο κωδικός ορίζεται από τον ίδιο τον χρήστη· εμείς δεν τον βλέπουμε ποτέ.
 */
export function confirmPasswordLink(
  $q: QVueGlobals,
  account: { email: string | null; activated: boolean },
  url: string,
): void {
  if (!account.email) {
    $q.notify({ type: 'warning', message: 'Δεν υπάρχει email — πρόσθεσέ το πρώτα.' });
    return;
  }
  $q.dialog({
    title: account.activated ? 'Επαναφορά κωδικού' : 'Ξανά αποστολή πρόσκλησης',
    message: `Θα σταλεί email στο ${account.email} με σύνδεσμο ορισμού κωδικού. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true, noCaps: true },
    ok: { label: 'Αποστολή', color: 'primary', unelevated: true, noCaps: true },
  }).onOk(() => {
    void (async () => {
      try {
        await post(url, {});
        $q.notify({ type: 'positive', icon: 'forward_to_inbox', message: `Στάλθηκε email στο ${account.email}.` });
      } catch (err) {
        $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Το email δεν έφυγε.' });
      }
    })();
  });
}

/** Το κουμπί που ταιριάζει: επαναφορά για όποιον έχει ήδη μπει, αλλιώς ξανά πρόσκληση. */
export function passwordLinkButton(activated: boolean): { icon: string; label: string } {
  return activated
    ? { icon: 'lock_reset', label: 'Επαναφορά κωδικού' }
    : { icon: 'forward_to_inbox', label: 'Ξανά αποστολή πρόσκλησης' };
}
