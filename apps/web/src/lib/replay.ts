import { OPENOBSERVE_ORG, OPENOBSERVE_RUM_TOKEN, OPENOBSERVE_URL, SENTRY_ENVIRONMENT } from './runtime-config';
import { setReplayUrlProvider } from './replay-link';

/*
 * Καταγραφή συνεδριών (OpenObserve RUM + Session Replay) — ROADMAP §6. Ξεκινά
 * ΜΟΝΟ αφού ο λογαριασμός αποδεχτεί την ενημέρωση (`trackingNotice`), και ποτέ
 * στις δημόσιες σελίδες των γονιών (εκεί δεν υπάρχει λογαριασμός να αποδεχτεί —
 * το καλεί μόνο το MainLayout, μέσω του TrackingNotice).
 *
 * Χωρίς masking, με απόφαση του Τοπικού (`defaultPrivacyLevel: 'allow'`):
 * κείμενα, πεδία και emails φαίνονται στο replay. Το RUM γράφει τις κλήσεις
 * δικτύου ως resources (URL, χρόνος, status) — όχι headers ούτε bodies.
 */

type Rum = typeof import('@openobserve/browser-rum').openobserveRum;

let rum: Rum | null = null;
let starting: Promise<void> | null = null;

export const replayConfigured = (): boolean => !!OPENOBSERVE_URL && !!OPENOBSERVE_RUM_TOKEN;

export function startReplay(user: { id: string; email: string; name: string }): Promise<void> {
  if (!replayConfigured() || rum) return Promise.resolve();
  starting ??= import('@openobserve/browser-rum')
    .then(({ openobserveRum }) => {
      const url = new URL(OPENOBSERVE_URL);
      openobserveRum.init({
        applicationId: 'trifylli-web',
        clientToken: OPENOBSERVE_RUM_TOKEN,
        site: url.host,
        // Το dev τρέχει σε http://localhost — αλλιώς το SDK στέλνει πάντα σε https.
        insecureHTTP: url.protocol === 'http:',
        organizationIdentifier: OPENOBSERVE_ORG,
        apiVersion: 'v1',
        service: 'trifylli-web',
        env: SENTRY_ENVIRONMENT,
        version: process.env.APP_VERSION ?? 'dev',
        sessionSampleRate: 100,
        // Η προεπιλογή του SDK είναι 0 (κανένα replay).
        sessionReplaySampleRate: 100,
        trackUserInteractions: true,
        trackResources: true,
        trackLongTasks: true,
        // Χωρίς masking (βλ. πάνω).
        defaultPrivacyLevel: 'allow',
      });
      openobserveRum.setUser({ id: user.id, email: user.email, name: user.name });
      openobserveRum.startSessionReplayRecording();
      rum = openobserveRum;
      setReplayUrlProvider(() => {
        const sessionId = openobserveRum.getInternalContext()?.session_id;
        return sessionId
          ? `${OPENOBSERVE_URL}/web/rum/sessions/view/${sessionId}?org_identifier=${encodeURIComponent(OPENOBSERVE_ORG)}`
          : null;
      });
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
  if (!rum) return;
  rum.stopSessionReplayRecording();
  rum.clearUser();
  rum.stopSession();
  rum = null;
  setReplayUrlProvider(null);
}
