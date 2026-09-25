import { Log, User, UserManager, WebStorageStateStore } from 'oidc-client-ts';

/**
 * Σύνδεση με το Authentik (OpenID Connect).
 *
 * Authorization Code + PKCE, χωρίς client secret: η PWA είναι δημόσιος client
 * και ό,τι ενσωματωθεί στο bundle είναι δημόσιο ούτως ή άλλως. Το PKCE είναι
 * αυτό που κάνει τη ροή ασφαλή εδώ.
 *
 * Τα tokens ζουν στο `sessionStorage` και όχι στο `localStorage`: κλείνοντας
 * την καρτέλα η συνεδρία τελειώνει, που είναι το σωστό για κοινόχρηστο
 * υπολογιστή Εστίας. Όσο η καρτέλα είναι ανοιχτή, η ανανέωση γίνεται σιωπηλά
 * μέσω κρυφού iframe προς το Authentik.
 */

import { OIDC_AUTHORITY, OIDC_CLIENT_ID, OIDC_LOGOUT_FLOW } from './runtime-config';

export { OIDC_AUTHORITY, OIDC_CLIENT_ID };

/** `false` ⇒ τρέχουμε σε development με `x-dev-email` αντί για πραγματικό login. */
export const oidcEnabled = Boolean(OIDC_AUTHORITY && OIDC_CLIENT_ID);

const REDIRECT_PATH = '/auth/callback';
const SILENT_PATH = '/auth/silent';

/** Πού βρισκόταν ο χρήστης πριν τον στείλουμε για login. */
const RETURN_TO_KEY = 'trifylli:returnTo';

function origin(): string {
  return window.location.origin;
}

let manager: UserManager | null = null;

export function userManager(): UserManager {
  if (!oidcEnabled) {
    throw new Error('Το OIDC δεν έχει ρυθμιστεί (OIDC_AUTHORITY / OIDC_CLIENT_ID).');
  }
  if (manager) return manager;

  if (process.env.DEV) Log.setLevel(Log.INFO);
  Log.setLogger(console);

  manager = new UserManager({
    authority: OIDC_AUTHORITY,
    client_id: OIDC_CLIENT_ID,
    redirect_uri: `${origin()}${REDIRECT_PATH}`,
    silent_redirect_uri: `${origin()}${SILENT_PATH}`,
    response_type: 'code',
    // Το `email` δεν είναι προαιρετικό: είναι το κλειδί που δένει την ταυτότητα
    // του Authentik με τον λογαριασμό της εφαρμογής.
    //
    // **Χωρίς `offline_access` σκοπίμως.** Το OIDC ορίζει ότι το offline_access
    // απαιτεί ρητή συγκατάθεση, και το Authentik το επιβάλλει προσθέτοντας
    // consent stage — δηλαδή μια οθόνη «Continue» στη μέση κάθε σύνδεσης. Η
    // ανανέωση γίνεται αντ' αυτού σιωπηλά με κρυφό iframe (`prompt=none`) πάνω
    // στη συνεδρία του Authentik, οπότε ο χρήστης δεν βλέπει ποτέ τίποτα.
    scope: 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
    // Ανανέωση 60΄΄ πριν τη λήξη, ώστε να μη σκάσει αίτημα στο ενδιάμεσο.
    accessTokenExpiringNotificationTimeInSeconds: 60,
    monitorSession: false,
    loadUserInfo: false,
  });

  return manager;
}

export async function currentUser(): Promise<User | null> {
  if (!oidcEnabled) return null;
  return userManager().getUser();
}

/** Ξεκινά τη ροή σύνδεσης, θυμούμενη πού ήθελε να πάει ο χρήστης. */
export async function login(returnTo?: string): Promise<void> {
  if (returnTo) {
    try {
      window.sessionStorage.setItem(RETURN_TO_KEY, returnTo);
    } catch {
      // Ιδιωτική περιήγηση: χάνουμε μόνο την επιστροφή στη σελίδα, όχι το login.
    }
  }
  await userManager().signinRedirect();
}

export async function completeLogin(): Promise<{ user: User; returnTo: string }> {
  const user = await userManager().signinRedirectCallback();
  let returnTo = '/';
  try {
    returnTo = window.sessionStorage.getItem(RETURN_TO_KEY) ?? '/';
    window.sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // βλ. παραπάνω
  }
  return { user, returnTo };
}

export async function completeSilentRenew(): Promise<void> {
  await userManager().signinSilentCallback();
}

/** Η ροή αποσύνδεσης του Authentik (βλ. `infra/authentik/trifylli-oidc.yaml`). */
const LOGOUT_FLOW = OIDC_LOGOUT_FLOW;

/**
 * Αποσύνδεση — και από το Authentik, όχι μόνο τοπικά.
 *
 * Σε κοινόχρηστο υπολογιστή Εστίας, ένα «logout» που αφήνει ζωντανή τη συνεδρία
 * του IdP είναι ψεύτικο: ο επόμενος χρήστης θα έμπαινε αυτόματα ως ο
 * προηγούμενος, ακριβώς επειδή η σύνδεση είναι αδιάκοπη.
 *
 * Δεν χρησιμοποιούμε το `end_session` endpoint του OIDC, παρότι είναι το
 * τυπικό: το Authentik προσθέτει σε αυτό μια οθόνη «You've logged out…» με
 * κουμπιά, χωρίς δυνατότητα παράκαμψης — είναι σταθερά στον κώδικά του.
 * Πηγαίνουμε αντ' αυτού στη ροή αποσύνδεσης, που τερματίζει τη συνεδρία και
 * επιστρέφει εδώ μέσω ενός redirect stage.
 */
export async function logout(): Promise<void> {
  // Πρώτα τα τοπικά: αν η ανακατεύθυνση αποτύχει, δεν μένει ζωντανό token.
  await userManager().removeUser();

  const authentik = new URL(OIDC_AUTHORITY).origin;
  window.location.assign(`${authentik}/if/flow/${LOGOUT_FLOW}/`);
}

export async function clearLocalSession(): Promise<void> {
  if (!oidcEnabled) return;
  await userManager().removeUser();
}
