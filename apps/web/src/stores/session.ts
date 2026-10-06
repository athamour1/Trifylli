import { defineStore } from 'pinia';
import type { User } from 'oidc-client-ts';
import { setAccessToken } from '../lib/api';
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
      manager.events.addSilentRenewError((error) => {
        this.error = error.message;
        void this.signOutLocally();
      });

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
          }
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.ready = true;
      }
    },

    async signIn(returnTo?: string): Promise<void> {
      await oidcLogin(returnTo);
    },

    async signOut(): Promise<void> {
      setAccessToken(null);
      this.user = null;
      await oidcLogout();
    },

    /** Καθαρίζει μόνο τοπικά — χωρίς ανακατεύθυνση στο Authentik. */
    async signOutLocally(): Promise<void> {
      setAccessToken(null);
      this.user = null;
      await clearLocalSession();
    },

    setUser(user: User): void {
      this.user = user;
      this.error = null;
      setAccessToken(user.access_token);
    },
  },
});
