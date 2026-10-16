import { HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider';
import { COLLAB_PATH, COLLAB_PROTOCOL } from '@trifylli/shared';
import { API_URL, DEV_ACCOUNT_EMAIL, currentAccessToken } from './api';
import { onCollabPurge } from './collab-storage';

/**
 * Η σύνδεση της συνεργασίας σε πραγματικό χρόνο (βλ. docs/synergasia.md).
 *
 * Ένα WebSocket ανά tab για όλα τα κοινά έγγραφα, στο ίδιο host με το API
 * (`…/api/collab`). Τα έγγραφα τα ανοίγει το `useCollabDoc`.
 */

/** Το WebSocket ζει όπου και το API: ίδιο host, κάτω από το πρόθεμά του. Σχετικό `API_URL` = ίδιο origin. */
export function collabUrl(apiUrl: string = API_URL, base: string = window.location.href): string {
  const api = new URL(apiUrl, base);
  const protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${api.host}${api.pathname.replace(/\/+$/, '')}/${COLLAB_PATH}`;
}

let socket: HocuspocusProviderWebsocket | null = null;

/** Η κοινή σύνδεση του tab· ξανασυνδέεται μόνη της, χωρίς όριο προσπαθειών (στο βουνό το σήμα πάει κι έρχεται). */
export function collabSocket(): HocuspocusProviderWebsocket {
  if (!socket) {
    socket = new HocuspocusProviderWebsocket({
      url: collabUrl(),
      maxAttempts: 0,
      delay: 1000,
      factor: 2,
      maxDelay: 30_000,
      jitter: true,
    });
    onCollabPurge(() => {
      socket?.destroy();
      socket = null;
    });
    // Ο browser «παγώνει» μια σελίδα που αφήνεις (back/forward cache) αντί να την
    // κλείσει — μαζί με το socket της: ο server θα σε έδειχνε «εδώ» για λεπτά. Όταν
    // φεύγει η σελίδα, κλείνει η σύνδεση· αν γυρίσεις με «πίσω», ξανανοίγει.
    window.addEventListener('pagehide', () => socket?.disconnect());
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) void socket?.connect();
    });
    // Μόλις επιστρέψει το σήμα, νέα προσπάθεια αμέσως — όχι στο επόμενο βήμα της
    // αναμονής (έως 30″), όσο η σελίδα γράφει «χωρίς σύνδεση».
    window.addEventListener('online', () => {
      if (socket && socket.status !== WebSocketStatus.Connected) void socket.connect();
    });
  }
  return socket;
}

/** Το «token» ενός εγγράφου: ποιος είσαι, ποια γενιά έχει η συσκευή, ποιο πρωτόκολλο μιλάς. */
export function collabToken(generation: string): string {
  return JSON.stringify({ t: currentAccessToken() || DEV_ACCOUNT_EMAIL || 'dev', g: generation, p: COLLAB_PROTOCOL });
}
