import { defineStore } from 'pinia';
import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';
import { Notify } from 'quasar';
import type { OutboxItem } from '@trifylli/shared';
import { ApiError, OfflineError, http } from '../lib/api';

const OUTBOX_KEY = 'trifylli:outbox';
const CACHE_PREFIX = 'trifylli:cache:';

/** Πόσες φορές ξαναπροσπαθούμε πριν σημάνουμε μια εγγραφή ως αποτυχημένη. */
const MAX_ATTEMPTS = 5;

/**
 * Offline-first πυρήνας.
 *
 * Γιατί ουρά και όχι απλό retry: το παρουσιολόγιο συμπληρώνεται στο γήπεδο και
 * η υποβολή πρέπει να «πετύχει» από τη σκοπιά του χρήστη ακόμη κι όταν δεν
 * υπάρχει σήμα. Η εγγραφή μπαίνει στην ουρά, το UI προχωρά, και ο συγχρονισμός
 * γίνεται μόλις επιστρέψει το δίκτυο.
 *
 * Τα 4xx **δεν** ξαναδοκιμάζονται: ένα 403 ή ένα άκυρο payload δεν διορθώνεται
 * με επανάληψη και θα κολλούσε την ουρά για πάντα.
 */
export const useOfflineStore = defineStore('offline', {
  state: () => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    outbox: [] as OutboxItem[],
    syncing: false,
    lastSyncAt: null as string | null,
  }),

  getters: {
    pending: (state) => state.outbox.filter((i) => i.attempts < MAX_ATTEMPTS).length,
    failed: (state) => state.outbox.filter((i) => i.attempts >= MAX_ATTEMPTS),
    hasPending(): boolean {
      return this.pending > 0;
    },
  },

  actions: {
    async init(): Promise<void> {
      this.outbox = (await idbGet<OutboxItem[]>(OUTBOX_KEY)) ?? [];

      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          this.online = true;
          void this.flush();
        });
        window.addEventListener('offline', () => {
          this.online = false;
        });
      }

      if (this.online) void this.flush();
    },

    /**
     * Στέλνει άμεσα αν υπάρχει δίκτυο, αλλιώς βάζει στην ουρά.
     * Επιστρέφει `queued: true` ώστε το UI να πει «θα σταλεί μόλις συνδεθείτε».
     */
    async submit<T>(
      method: OutboxItem['method'],
      url: string,
      body: unknown,
      options: { replace?: boolean } = {},
    ): Promise<{ queued: boolean; data?: T }> {
      if (this.online) {
        try {
          const response = await http.request<T>({ method, url, data: body });
          return { queued: false, data: response.data };
        } catch (error) {
          // Μόνο η απώλεια δικτύου οδηγεί στην ουρά· τα σφάλματα του server
          // πρέπει να φτάσουν στον χρήστη τώρα.
          if (!(error instanceof OfflineError)) throw error;
          this.online = false;
        }
      }

      await this.enqueue({ method, url, body }, options.replace === true);
      return { queued: true };
    },

    /**
     * Βάζει μια εγγραφή στην ουρά.
     *
     * Με `replace`, η νέα εγγραφή **αντικαθιστά** όσες εκκρεμούν για το ίδιο
     * `method`+`url`. Το χρειάζονται οι οθόνες που αποθηκεύουν μόνες τους: κάθε
     * παύση θα πρόσθετε μια ακόμη εκδοχή του ίδιου παρουσιολογίου, και χωρίς
     * σήμα η ουρά θα γέμιζε με είκοσι αντίγραφα της ίδιας σελίδας.
     *
     * Δύο εξαιρέσεις, και οι δύο για να μη χαθεί τίποτα:
     *  * όσο αδειάζει η ουρά δεν αντικαθιστούμε — η `flush` δουλεύει πάνω σε
     *    στιγμιότυπο και στο τέλος θα επανέφερε ό,τι μόλις αφαιρέσαμε·
     *  * οι εγγραφές που έχουν ήδη αποτύχει μένουν, ώστε το σφάλμα τους να
     *    φτάσει στον χρήστη αντί να εξαφανιστεί σιωπηλά.
     */
    async enqueue(
      input: { method: OutboxItem['method']; url: string; body: unknown },
      replace = false,
    ): Promise<void> {
      const item: OutboxItem = {
        id: crypto.randomUUID(),
        method: input.method,
        url: input.url,
        body: input.body,
        createdAt: new Date().toISOString(),
        attempts: 0,
      };

      const superseded = (candidate: OutboxItem): boolean =>
        replace &&
        !this.syncing &&
        candidate.attempts === 0 &&
        candidate.method === input.method &&
        candidate.url === input.url;

      this.outbox = [...this.outbox.filter((existing) => !superseded(existing)), item];
      await this.persist();
    },

    /** Αδειάζει την ουρά με τη σειρά που μπήκαν οι εγγραφές. */
    async flush(): Promise<void> {
      if (this.syncing || this.outbox.length === 0) return;
      this.syncing = true;

      let sent = 0;
      const remaining: OutboxItem[] = [];

      for (const item of this.outbox) {
        if (item.attempts >= MAX_ATTEMPTS) {
          remaining.push(item);
          continue;
        }

        try {
          await http.request({ method: item.method, url: item.url, data: item.body });
          sent += 1;
        } catch (error) {
          if (error instanceof OfflineError) {
            // Χάθηκε ξανά το δίκτυο: κρατάμε ΟΛΑ τα υπόλοιπα ανέπαφα, χωρίς να
            // χρεώσουμε προσπάθεια — δεν φταίει το περιεχόμενο.
            this.online = false;
            remaining.push(item, ...this.outbox.slice(this.outbox.indexOf(item) + 1));
            break;
          }

          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            // Μόνιμη αποτυχία: σημαίνεται και βγαίνει από τη ροή επαναλήψεων.
            remaining.push({ ...item, attempts: MAX_ATTEMPTS, lastError: error.message });
            continue;
          }

          remaining.push({
            ...item,
            attempts: item.attempts + 1,
            lastError: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.outbox = remaining;
      this.syncing = false;
      this.lastSyncAt = new Date().toISOString();
      await this.persist();

      if (sent > 0) {
        Notify.create({ type: 'positive', message: `Συγχρονίστηκαν ${sent} εγγραφές.` });
      }
      const failures = this.failed;
      if (failures.length > 0) {
        Notify.create({
          type: 'negative',
          message: `${failures.length} εγγραφές δεν στάλθηκαν.`,
          ...(failures[0]?.lastError ? { caption: failures[0].lastError } : {}),
          timeout: 6000,
        });
      }
    },

    /** Αφαιρεί μια μόνιμα αποτυχημένη εγγραφή μετά από απόφαση του χρήστη. */
    async discard(id: string): Promise<void> {
      this.outbox = this.outbox.filter((i) => i.id !== id);
      await this.persist();
    },

    /** Ξαναδίνει ευκαιρία σε μια αποτυχημένη εγγραφή. */
    async retry(id: string): Promise<void> {
      this.outbox = this.outbox.map((i) => {
        if (i.id !== id) return i;
        const { lastError: _dropped, ...rest } = i;
        return { ...rest, attempts: 0 };
      });
      await this.persist();
      await this.flush();
    },

    async persist(): Promise<void> {
      await idbSet(OUTBOX_KEY, [...this.outbox]);
    },

    // ───────────────────── Cache δεδομένων ανάγνωσης ─────────────────────

    /**
     * Διαβάζει από το δίκτυο και κρατά αντίγραφο· χωρίς δίκτυο επιστρέφει το
     * αντίγραφο. Το `stale` λέει στο UI ότι βλέπει αποθηκευμένα δεδομένα.
     */
    async cachedGet<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T; stale: boolean }> {
      try {
        const data = await fetcher();
        await idbSet(CACHE_PREFIX + key, { data, at: Date.now() });
        return { data, stale: false };
      } catch (error) {
        if (!(error instanceof OfflineError)) throw error;
        this.online = false;

        const cached = await idbGet<{ data: T; at: number }>(CACHE_PREFIX + key);
        if (!cached) throw error;
        return { data: cached.data, stale: true };
      }
    },

    async clearCache(key: string): Promise<void> {
      await idbDel(CACHE_PREFIX + key);
    },

    /**
     * Σβήνει ΟΛΑ τα τοπικά δεδομένα: cache ανάγνωσης, ουρά, και το cache του
     * service worker για το API.
     *
     * Καλείται στην αποσύνδεση. Χωρίς αυτό, στον κοινόχρηστο υπολογιστή της
     * Εστίας ο επόμενος χρήστης βρίσκει μητρώο, συνδρομές και ταμείο του
     * προηγούμενου μέσα στο Cache Storage — και η ουρά του προηγούμενου θα
     * έφευγε με το token του επόμενου. Το «κλείνει η καρτέλα, τελειώνει η
     * συνεδρία» πρέπει να ισχύει και για τα δεδομένα, όχι μόνο για τα tokens.
     */
    async purgeLocalData(): Promise<void> {
      this.outbox = [];
      try {
        const all = await idbKeys();
        await Promise.all(
          all
            .filter((k) => typeof k === 'string' && (k.startsWith(CACHE_PREFIX) || k === OUTBOX_KEY))
            .map((k) => idbDel(k)),
        );
      } catch {
        // Χωρίς IndexedDB (ιδιωτική περιήγηση) δεν υπάρχει και τι να σβηστεί.
      }
      try {
        if (typeof caches !== 'undefined') await caches.delete('trifylli-api');
      } catch {
        // Ό,τι δεν σβήστηκε θα λήξει μόνο του (ExpirationPlugin).
      }
    },
  },
});
