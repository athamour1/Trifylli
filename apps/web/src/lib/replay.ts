import { OPENREPLAY_PROJECT_KEY, OPENREPLAY_URL } from './runtime-config';
import { setReplayUrl } from './replay-link';

/*
 * Καταγραφή συνεδριών (OpenReplay) — ROADMAP §6. Ξεκινά ΜΟΝΟ αφού ο λογαριασμός
 * αποδεχτεί την ενημέρωση (`trackingNotice`), και ποτέ στις δημόσιες σελίδες των
 * γονιών (εκεί δεν υπάρχει λογαριασμός να αποδεχτεί — το καλεί μόνο το MainLayout).
 *
 * Χωρίς masking, με απόφαση του Τοπικού: κείμενα, πεδία και emails φαίνονται
 * στο replay, και οι κλήσεις δικτύου γράφονται με το body τους. ΟΧΙ τα headers
 * `Authorization`/`Cookie`: το replay θα κρατούσε ζωντανά tokens.
 */

type Tracker = import('@openreplay/tracker').default;

let tracker: Tracker | null = null;
let starting: Promise<void> | null = null;

export const replayConfigured = (): boolean => !!OPENREPLAY_URL && !!OPENREPLAY_PROJECT_KEY;

export function startReplay(user: { id: string; email: string; name: string }): Promise<void> {
  if (!replayConfigured() || tracker) return Promise.resolve();
  starting ??= import('@openreplay/tracker')
    .then(async ({ default: Tracker }) => {
      const instance = new Tracker({
        projectKey: OPENREPLAY_PROJECT_KEY,
        ingestPoint: `${OPENREPLAY_URL}/ingest`,
        // Χωρίς masking (βλ. πάνω).
        defaultInputMode: 0,
        obscureTextEmails: false,
        obscureTextNumbers: false,
        obscureInputEmails: false,
        obscureInputNumbers: false,
        obscureInputDates: false,
        network: {
          failuresOnly: false,
          captureInIframes: false,
          capturePayload: true,
          ignoreHeaders: ['authorization', 'cookie', 'set-cookie'],
          // Κανένα επιπλέον header προς το API (θα ήθελε αλλαγή στο CORS).
          sessionTokenHeader: false,
        },
        // Το dev τρέχει σε http://localhost — ο tracker αλλιώς αρνείται.
        __DISABLE_SECURE_MODE: location.protocol !== 'https:',
        css: {},
      });
      await instance.start({ userID: user.email, metadata: { accountId: user.id, name: user.name } });
      tracker = instance;
      setReplayUrl(instance.getSessionURL({ withCurrentTime: false }) ?? null);
    })
    .catch((error: unknown) => {
      console.warn('Η καταγραφή συνεδρίας δεν ξεκίνησε:', error);
    })
    .finally(() => {
      starting = null;
    });
  return starting;
}

/** Στην αποσύνδεση: η επόμενη συνεδρία (άλλος λογαριασμός) είναι νέα εγγραφή. */
export function stopReplay(): void {
  tracker?.stop();
  tracker = null;
  setReplayUrl(null);
}
