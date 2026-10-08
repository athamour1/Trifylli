import { defineStore } from 'pinia';
import { Notify } from 'quasar';
import type { User } from 'oidc-client-ts';
import { setAccessToken, setUnauthorizedHandler } from '../lib/api';
import { useOfflineStore } from './offline';
import {
  clearLocalSession,
  clearStaleAuthState,
  currentUser,
  login as oidcLogin,
  logout as oidcLogout,
  oidcEnabled,
  userManager,
} from '../lib/oidc';

/** Το `storage` listener του SLO δένεται μία φορά (το `init` μπορεί να κληθεί ξανά). */
let sloListenerBound = false;

/** Πού βρισκόμαστε, για να γυρίσουμε εδώ μετά τη σύνδεση — εκτός αν είμαστε ήδη στη σύνδεση. */
function currentLocation(): string | undefined {
  const here = window.location.pathname + window.location.search;
  return here.startsWith('/login') || here.startsWith('/auth/') || here.startsWith('/session-expired') ? undefined : here;
}

/**
 * Η σελίδα «έσβησε η φωτιά». Πλήρης φόρτωση και όχι router.push: η συνεδρία
 * μόλις καθαρίστηκε, και μια καθαρή εκκίνηση δεν αφήνει πίσω μισοφορτωμένα
 * stores να δείχνουν δεδομένα που δεν έχουν πια δικαίωμα να δείχνουν.
 */
function goToExpiredPage(): void {
  const back = currentLocation();
  const target = back ? `/session-expired?returnTo=${encodeURIComponent(back)}` : '/session-expired';
  window.location.assign(target);
}

/**
 * Η συνεδρία OIDC: το «ποιος είσαι» κατά το Authentik.
 *
 * Ξεχωριστό store από το `auth`, που κρατά το «τι μπορείς» κατά το Trifylli.
 * Ο διαχωρισμός δεν είναι τυπικός: το token μπορεί να είναι έγκυρο ενώ ο
 * λογαριασμός έχει ανακληθεί, και τότε το σωστό μήνυμα δεν είναι «συνδεθείτε»
 * αλλά «δεν έχετε πρόσβαση».
 */
export const useSessionStore = defineStore('session', {
  state: () => ({
    /** `false` όσο δεν ξέρουμε ακόμη αν υπάρχει συνεδρία. */
    ready: false,
    user: null as User | null,
    error: null as string | null,
    /**
     * Υπήρχε συνεδρία και χάθηκε (ληγμένο token που δεν ανανεώθηκε, 401 από το
     * API). Διαφέρει από το «δεν συνδέθηκε ποτέ»: ο guard τον στέλνει στη
     * σελίδα «έσβησε η φωτιά» αντί κατευθείαν στο Authentik.
     */
    expired: false,
  }),

  getters: {
    /** Σε development χωρίς OIDC θεωρούμαστε πάντα συνδεδεμένοι. */
    authenticated: (state) => !oidcEnabled || (state.user !== null && !state.user.expired),
    enabled: () => oidcEnabled,
    email: (state) => (state.user?.profile.email as string | undefined) ?? null,
  },

  actions: {
    /**
     * Καλείται μία φορά στην εκκίνηση. Δεν ανακατευθύνει: αφήνει τον router να
     * αποφασίσει, ώστε η σελίδα callback να μπορεί να ολοκληρώσει τη ροή.
     */
    async init(): Promise<void> {
      if (!oidcEnabled) {
        this.ready = true;
        return;
      }

      const manager = userManager();

      // Ημιτελείς αιτήσεις σύνδεσης (κλειστή καρτέλα στην οθόνη του Authentik)
      // αφήνουν εγγραφές στο `localStorage`· τις καθαρίζουμε στην εκκίνηση.
      void clearStaleAuthState();

      manager.events.addUserLoaded((user) => {
        this.user = user;
        setAccessToken(user.access_token);
      });

      manager.events.addUserUnloaded(() => {
        this.user = null;
        setAccessToken(null);
      });

      // Αν η σιωπηλή ανανέωση αποτύχει, η συνεδρία τελείωσε πραγματικά — δεν
      // έχει νόημα να κρατάμε ληγμένο token και να τρώμε 401 σε κάθε αίτημα.
      // Δεν ανακατευθύνουμε αμέσως: μπορεί να γράφει παρουσιολόγιο. Το λέμε, με
      // κουμπί· το επόμενο αίτημα προς το API θα τον στείλει ούτως ή άλλως.
      manager.events.addSilentRenewError((error) => {
        this.error = error.message;
        this.expired = true;
        void this.signOutLocally();
        Notify.create({
          type: 'warning',
          icon: 'lock_clock',
          message: 'Η συνεδρία σου έληξε.',
          caption: 'Συνδέσου ξανά για να συνεχίσεις από εδώ.',
          timeout: 0,
          actions: [{ label: 'Σύνδεση', color: 'white', handler: () => goToExpiredPage() }],
        });
      });

      // 401 από το API ενώ είχαμε token: μία σιωπηλή ανανέωση, αλλιώς σύνδεση.
      setUnauthorizedHandler(() => this.recoverSession());

      // Front-channel Single Logout: όταν ο χρήστης αποσυνδεθεί από άλλη
      // εφαρμογή/καρτέλα του ίδιου SSO, το κρυφό iframe του Authentik σηκώνει το
      // σήμα `trifylli:slo` στο localStorage. Το `storage` event σκάει μόνο στις
      // ΑΛΛΕΣ καρτέλες ίδιας προέλευσης — άρα εδώ, στην κύρια. Κλείνουμε τη
      // συνεδρία και πάμε σε καθαρή οθόνη σύνδεσης.
      if (!sloListenerBound) {
        sloListenerBound = true;
        window.addEventListener('storage', (event) => {
          if (event.key === 'trifylli:slo' && event.newValue) {
            void this.signOutLocally().finally(() => window.location.assign('/login'));
          }
        });
      }

      try {
        const user = await currentUser();
        if (user && !user.expired) {
          this.user = user;
          setAccessToken(user.access_token);
        } else if (user?.expired) {
          // Ληγμένο αλλά με refresh token: μια σιωπηλή ανανέωση γλιτώνει
          // ολόκληρη ανακατεύθυνση στο Authentik.
          const renewed = await manager.signinSilent();
          if (renewed) {
            this.user = renewed;
            setAccessToken(renewed.access_token);
          } else {
            this.expired = true;
          }
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        // Είχε συνεδρία και δεν ανανεώθηκε: «έσβησε», δεν «δεν άναψε ποτέ».
        if (this.user === null) this.expired = true;
      } finally {
        this.ready = true;
      }
    },

    async signIn(returnTo?: string): Promise<void> {
      await oidcLogin(returnTo);
    },

    /**
     * Το API απέρριψε το token μας. Ή έληξε λίγο πριν την προγραμματισμένη
     * ανανέωση, ή η συνεδρία στο Authentik τελείωσε (π.χ. άλλαξε ο κωδικός από
     * αλλού). Μία σιωπηλή ανανέωση· αν δεν περάσει, καθαρίζουμε και πάμε στην
     * οθόνη σύνδεσης με επιστροφή στην ίδια σελίδα.
     */
    async recoverSession(): Promise<string | null> {
      if (!oidcEnabled) return null;
      try {
        const renewed = await userManager().signinSilent();
        if (renewed && !renewed.expired) {
          this.setUser(renewed);
          return renewed.access_token;
        }
      } catch {
        // Η συνεδρία του Authentik δεν υπάρχει πια — πέφτουμε στη σύνδεση.
      }
      this.expired = true;
      await this.signOutLocally();
      goToExpiredPage();
      return null;
    },

    async signOut(): Promise<void> {
      setAccessToken(null);
      this.user = null;
      // Πρώτα τα δεδομένα, μετά η ανακατεύθυνση: αν φύγουμε πριν τελειώσει το
      // σβήσιμο, ο επόμενος χρήστης του ίδιου υπολογιστή κληρονομεί το cache.
      await useOfflineStore().purgeLocalData();
      await oidcLogout();
    },

    /** Καθαρίζει μόνο τοπικά — χωρίς ανακατεύθυνση στο Authentik. */
    async signOutLocally(): Promise<void> {
      setAccessToken(null);
      this.user = null;
      await useOfflineStore().purgeLocalData();
      await clearLocalSession();
    },

    setUser(user: User): void {
      this.user = user;
      this.error = null;
      this.expired = false;
      setAccessToken(user.access_token);
    },
  },
});
