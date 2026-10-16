import { HocuspocusProvider, WebSocketStatus, type StatesArray } from '@hocuspocus/provider';
import {
  COLLAB_GENERATION_KEY,
  COLLAB_META,
  CollabRejection,
  collabColor,
  collabShortName,
  type CollabChange,
  type CollabPresenceUser,
} from '@trifylli/shared';
import { Notify, copyToClipboard } from 'quasar';
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import { Doc } from 'yjs';
import { refreshAccessToken } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';
import { collabSocket, collabToken } from '../lib/collab';
import { COLLAB_DB_PREFIX, rememberCollabDb } from '../lib/collab-storage';
import { parseChange } from '../lib/live-changes';
import type { SaveState } from '../lib/save-state';

/**
 * Πού βρίσκεται ένα κοινό έγγραφο:
 *  * `loading` — διαβάζεται το αντίγραφο της συσκευής·
 *  * `connecting` / `synced` — μιλάμε με τον server·
 *  * `offline` — χωρίς δίκτυο· ό,τι γράφεται μένει στη συσκευή και ενώνεται μετά·
 *  * `update-required` — παλιά έκδοση εφαρμογής, θέλει ανανέωση·
 *  * `forbidden` — δεν υπάρχει ή δεν έχεις πρόσβαση.
 */
export type CollabStatus = 'loading' | 'connecting' | 'synced' | 'offline' | 'update-required' | 'forbidden';

/**
 * Όσοι ακούν τα «άλλαξε αυτό» ενός εγγράφου που το έχει ανοίξει άλλο κομμάτι της
 * σελίδας (π.χ. τα σχόλια ενός πεδίου) — ανά όνομα εγγράφου.
 */
const documentListeners = new Map<string, Set<(change: CollabChange) => void>>();

/** Ακούει τα «άλλαξε αυτό» ενός εγγράφου όσο είναι ανοιχτό εδώ. Επιστρέφει το «σταμάτα». */
export function onDocumentChange(name: string, handler: (change: CollabChange) => void): () => void {
  const handlers = documentListeners.get(name) ?? new Set();
  handlers.add(handler);
  documentListeners.set(name, handlers);
  return () => {
    handlers.delete(handler);
    if (!handlers.size) documentListeners.delete(name);
  };
}

/** Οι άλλοι στο έγγραφο — ένας ανά άτομο, όσα tabs κι αν έχει ανοιχτά. */
function otherPeers(states: StatesArray, myClientId: number, myUserId: string | undefined): CollabPresenceUser[] {
  const byId = new Map<string, CollabPresenceUser>();
  for (const state of states) {
    const user = state.user as CollabPresenceUser | undefined;
    if (state.clientId === myClientId || !user?.id || user.id === myUserId) continue;
    byId.set(user.id, user);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'el'));
}

/**
 * Τα κείμενα ενός εγγράφου — για να μη χαθεί τίποτα όταν πετιέται ένα αντίγραφο.
 * Με `getText` και όχι με έλεγχο τύπου: ένα πεδίο που δεν έχει ανοίξει ακόμα κανείς
 * επεξεργαστής είναι, μετά το φόρτωμα από τη συσκευή, ένας «άτυπος» τύπος.
 */
function texts(doc: Doc): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of doc.share.keys()) {
    if (key === COLLAB_META) continue;
    try {
      out[key] = doc.getText(key).toString();
    } catch {
      // Όχι κείμενο (άλλος τύπος) — δεν αφορά εδώ.
    }
  }
  return out;
}

/**
 * Ένα κοινό έγγραφο (Yjs) πάνω στην κοινή σύνδεση του tab.
 *
 * Κρατά αντίγραφο στη συσκευή (IndexedDB): ό,τι γράφεται χωρίς δίκτυο δεν
 * χάνεται ούτε αν κλείσει το tab, και ενώνεται μόνο του με τις αλλαγές των
 * άλλων όταν επιστρέψει το σήμα. Ένα έγγραφο που δεν άνοιξε ποτέ σε αυτή τη
 * συσκευή δεν είναι `ready` χωρίς δίκτυο — η σελίδα δείχνει τότε το κείμενο από
 * το cache, μόνο για ανάγνωση.
 */
export function useCollabDoc(name: string, me: () => CollabPresenceUser | null, options: { persist?: boolean } = {}) {
  /** Δωμάτιο (χωρίς περιεχόμενο): χωρίς αντίγραφο στη συσκευή. */
  const persist = options.persist ?? true;
  const doc = shallowRef(new Doc());
  const awareness = shallowRef(new Awareness(doc.value));
  const status = ref<CollabStatus>('loading');
  const readOnly = ref(false);
  const ready = ref(false);
  const unsynced = ref(0);
  const offline = useOfflineStore();
  const peers = ref<CollabPresenceUser[]>([]);
  /** Οι άλλοι, με το πού βρίσκονται (`focus` — π.χ. η γραμμή που επεξεργάζονται). */
  const peerFocus = ref<{ user: CollabPresenceUser; focus: string | null }[]>([]);

  const dbName = COLLAB_DB_PREFIX + name;
  let provider: HocuspocusProvider | null = null;
  let persistence: IndexeddbPersistence | null = null;
  let destroyed = false;
  let reopenTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTokenRefresh = 0;
  /** Όσοι θέλουν τα «άλλαξε αυτό» του server (βλ. `onChange`). */
  const changeHandlers = new Set<(change: CollabChange) => void>();
  /** Η σύνδεση έπεσε μετά από συγχρονισμό: στον επόμενο, μπορεί να χάθηκαν μηνύματα. */
  let missed = false;
  let everSynced = false;

  const generation = (): string =>
    (doc.value.getMap(COLLAB_META).get(COLLAB_GENERATION_KEY) as string | undefined) ?? '';

  function announce(): void {
    const user = me();
    if (user) awareness.value.setLocalStateField('user', user);
  }

  async function open(): Promise<void> {
    if (persist) {
      persistence = new IndexeddbPersistence(dbName, doc.value);
      rememberCollabDb(dbName);
      await persistence.whenSynced.catch(() => undefined);
    }
    if (destroyed) return;
    // Αντίγραφο με γενιά = έχει συγχρονιστεί κάποτε· γράφεται και χωρίς δίκτυο.
    if (generation()) ready.value = true;
    announce();
    connect();
  }

  function connect(): void {
    const socket = collabSocket();
    status.value = navigator.onLine === false ? 'offline' : 'connecting';
    provider = new HocuspocusProvider({
      websocketProvider: socket,
      name,
      document: doc.value,
      awareness: awareness.value,
      token: () => collabToken(generation()),
      onAuthenticated: ({ scope }) => {
        readOnly.value = scope === 'readonly';
      },
      onSynced: () => {
        ready.value = true;
        status.value = 'synced';
        if (missed) emitChange({ topic: '*', by: null, origin: null });
        missed = false;
        everSynced = true;
      },
      onStateless: ({ payload }) => {
        const change = parseChange(payload);
        if (change) emitChange(change);
      },
      onAuthenticationFailed: ({ reason }) => void rejected(reason),
      onUnsyncedChanges: ({ number }) => {
        unsynced.value = number;
      },
      onStatus: ({ status: socketStatus }) => {
        if (status.value === 'update-required' || status.value === 'forbidden') return;
        if (socketStatus === WebSocketStatus.Disconnected) {
          status.value = 'offline';
          missed ||= everSynced;
        }
        else if (socketStatus === WebSocketStatus.Connected && status.value === 'offline') status.value = 'connecting';
      },
      // Ο server έκλεισε **αυτό** το έγγραφο ενώ η σύνδεση ζει (ανάκληση
      // δικαιωμάτων): ξανανοίγει, με τα νέα δικαιώματα.
      onClose: () => {
        // Ό,τι έστειλε ο server όσο ήταν κλειστό χάθηκε: στον επόμενο συγχρονισμό «*».
        missed ||= everSynced;
        if (collabSocket().status === WebSocketStatus.Connected) reopenSoon();
      },
      onAwarenessChange: ({ states }) => {
        peers.value = otherPeers(states, doc.value.clientID, me()?.id);
        const mine = me()?.id;
        peerFocus.value = states
          .filter((state) => state.clientId !== doc.value.clientID && (state.user as CollabPresenceUser | undefined)?.id && (state.user as CollabPresenceUser).id !== mine)
          .map((state) => ({ user: state.user as CollabPresenceUser, focus: typeof state.focus === 'string' ? state.focus : null }));
      },
    });
    provider.attach();
  }

  function disconnect(): void {
    if (reopenTimer) clearTimeout(reopenTimer);
    reopenTimer = null;
    // Απορρίφθηκε (δεν άνοιξε ποτέ στον server): χωρίς μήνυμα κλεισίματος. Ο server
    // κρατά στην ουρά ό,τι έρχεται για έγγραφο χωρίς σύνδεση, και θα το εφάρμοζε
    // στην επόμενη, πετυχημένη σύνδεση του ίδιου εγγράφου — κλείνοντάς την.
    if (provider && !provider.isAuthenticated) {
      provider.configuration.websocketProvider.configuration.providerMap.delete(provider.effectiveName);
    }
    provider?.destroy();
    provider = null;
  }

  /**
   * Ξανά έλεγχος στο ίδιο έγγραφο, πάνω στην ίδια σύνδεση: νέο token και νέος
   * συγχρονισμός. Ο provider, η awareness και ο επεξεργαστής μένουν ίδιοι — ο
   * κέρσορας δεν χάνει τη θέση του.
   */
  function reopenSoon(delay = 800): void {
    if (destroyed || reopenTimer) return;
    reopenTimer = setTimeout(() => {
      reopenTimer = null;
      if (destroyed || !provider) return;
      if (collabSocket().status === WebSocketStatus.Connected) void provider.onOpen(new Event('open'));
    }, delay);
  }

  async function rejected(reason: string): Promise<void> {
    if (destroyed) return;
    switch (reason) {
      case CollabRejection.UPDATE_REQUIRED:
        status.value = 'update-required';
        disconnect();
        return;
      case CollabRejection.FORBIDDEN:
        status.value = 'forbidden';
        disconnect();
        return;
      case CollabRejection.UNAUTHENTICATED: {
        // Ληγμένο token: μία σιωπηλή ανανέωση, το πολύ μία φορά ανά 30″.
        if (Date.now() - lastTokenRefresh < 30_000) {
          status.value = 'offline';
          reopenSoon(30_000);
          return;
        }
        lastTokenRefresh = Date.now();
        if (await refreshAccessToken()) reopenSoon(0);
        return;
      }
      case CollabRejection.STALE_GENERATION:
        await replaceLocalCopy();
        return;
    }
  }

  /**
   * Το αντίγραφο της συσκευής είναι από άλλη γενιά (ο server ξαναγέμισε το
   * έγγραφο, π.χ. μετά από επαναφορά): δεν ενώνεται — θα έβγαζε διπλό κείμενο.
   * Πετιέται, και αν είχε κάτι που δεν έφτασε ποτέ στον server, ο χρήστης
   * μπορεί να το αντιγράψει.
   */
  async function replaceLocalCopy(): Promise<void> {
    const before = texts(doc.value);
    disconnect();
    await persistence?.clearData();
    persistence = null;
    doc.value.destroy();
    doc.value = new Doc();
    awareness.value = new Awareness(doc.value);
    ready.value = false;
    await open();
    const fresh = provider;
    fresh?.on('synced', function compare() {
      fresh.off('synced', compare);
      const after = texts(doc.value);
      const lost = Object.entries(before)
        .filter(([key, text]) => text.trim() && text !== (after[key] ?? ''))
        .map(([, text]) => text);
      if (!lost.length) return;
      Notify.create({
        type: 'warning',
        timeout: 0,
        message: 'Το κείμενο άλλαξε στον server και η συσκευή είχε άλλη εκδοχή.',
        caption: 'Αν χρειάζεσαι ό,τι είχες γράψει εδώ, αντίγραψέ το.',
        actions: [
          { label: 'Αντιγραφή', color: 'white', handler: () => void copyToClipboard(lost.join('\n\n')) },
          { label: 'Κλείσιμο', color: 'white' },
        ],
      });
    });
  }

  /**
   * Αν γράφεται τώρα: ο server το επιτρέπει και η σύνδεση δεν έχει κλείσει
   * οριστικά. Χωρίς πρόσβαση πια (αφαιρέθηκε, αρχειοθετήθηκε) ό,τι γραφόταν δεν
   * θα έφτανε ποτέ — καλύτερα να μη γράφεται καθόλου.
   */
  const writable = computed(() => !readOnly.value && status.value !== 'update-required' && status.value !== 'forbidden');

  /** Για το `SaveStatus`: τι έγινε με ό,τι γράφτηκε. */
  const saveState = computed<SaveState>(() => {
    switch (status.value) {
      case 'loading':
        return 'clean';
      case 'offline':
        return 'offline';
      case 'update-required':
      case 'forbidden':
        // Ό,τι δεν έφτασε δεν θα φτάσει πια· αν δεν εκκρεμούσε τίποτα, δεν χάθηκε τίποτα.
        return unsynced.value > 0 ? 'error' : 'saved';
      default:
        if (unsynced.value === 0) return 'saved';
        // Ο browser ξέρει ήδη ότι δεν υπάρχει δίκτυο· το socket το καταλαβαίνει
        // αργότερα (όταν σιωπήσει), και ως τότε το «αποθήκευση…» θα ήταν ψέμα.
        return offline.online ? 'saving' : 'offline';
    }
  });

  /** Πού είμαι (π.χ. ποια γραμμή επεξεργάζομαι) — το βλέπουν οι άλλοι δίπλα στη γραμμή. */
  function setFocus(focus: string | null): void {
    awareness.value.setLocalStateField('focus', focus);
  }

  function emitChange(change: CollabChange): void {
    for (const handler of changeHandlers) handler(change);
    for (const handler of documentListeners.get(name) ?? []) handler(change);
  }

  /**
   * Τα «άλλαξε αυτό» του server για ό,τι δεν είναι μέσα στο έγγραφο (κεφαλίδα,
   * λίστες — βλ. `CollabChange`), και «*» όταν η σύνδεση ξανανοίγει μετά από
   * διακοπή. Επιστρέφει το «σταμάτα».
   */
  function onChange(handler: (change: CollabChange) => void): () => void {
    changeHandlers.add(handler);
    return () => changeHandlers.delete(handler);
  }

  /** Περιμένει να φτάσουν στον server όσα γράφτηκαν (π.χ. πριν από οριστικοποίηση). */
  function whenSaved(timeoutMs = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = (): void => {
        if (status.value === 'synced' && unsynced.value === 0) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  void open();

  onBeforeUnmount(() => {
    destroyed = true;
    changeHandlers.clear();
    disconnect();
    void persistence?.destroy();
    doc.value.destroy();
  });

  return { doc, awareness, status, readOnly, writable, ready, unsynced, peers, peerFocus, setFocus, saveState, whenSaved, onChange };
}

/** Ο συνδεδεμένος χρήστης όπως τον δείχνει η παρουσία — ίδια μορφή με αυτή που ορίζει ο server. */
export function useCollabMe(): () => CollabPresenceUser | null {
  const auth = useAuthStore();
  return () => {
    const user = auth.profile?.user;
    return user
      ? { id: user.id, name: collabShortName(user.firstName, user.lastName), fullName: auth.displayName, color: collabColor(user.id) }
      : null;
  };
}
