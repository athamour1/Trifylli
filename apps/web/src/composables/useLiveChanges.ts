import type { CollabChange, CollabPresenceUser } from '@trifylli/shared';
import { inject, onBeforeUnmount, provide, type InjectionKey, type Ref } from 'vue';
import { concernsMe } from '../lib/live-changes';
import { subscribeTopiko } from '../lib/topiko-live';

/** «Άκου τα άλλαξε-αυτό» — επιστρέφει το «σταμάτα» (βλ. `useCollabDoc().onChange`). */
export type SubscribeChanges = (handler: (change: CollabChange) => void) => () => void;

/** Το δωμάτιο όπως το βλέπουν οι καρτέλες: μηνύματα, και ποιος είναι πού. */
export interface LiveRoom {
  subscribe: SubscribeChanges;
  setFocus: (focus: string | null) => void;
  peerFocus: Ref<{ user: CollabPresenceUser; focus: string | null }[]>;
}

const LIVE_ROOM: InjectionKey<LiveRoom> = Symbol('live-room');

/** Η σελίδα που ανοίγει το δωμάτιο (π.χ. η δράση) το δίνει στις καρτέλες της. */
export function provideLiveChanges(room: LiveRoom): void {
  provide(LIVE_ROOM, room);
}

/**
 * Ποιος επεξεργάζεται ποια γραμμή (`area` = η λίστα, π.χ. «schedule»): η σελίδα
 * λέει πού είσαι (`focusRow`) και δείχνει δίπλα σε κάθε γραμμή όποιον άλλον
 * είναι εκεί (`editorsOf`). Χωρίς δωμάτιο δεν δείχνει τίποτα.
 */
export function useRowPresence(area: string) {
  const room = inject(LIVE_ROOM, null);
  function editorsOf(id: string): CollabPresenceUser[] {
    const byId = new Map<string, CollabPresenceUser>();
    for (const peer of room?.peerFocus.value ?? []) if (peer.focus === `${area}:${id}`) byId.set(peer.user.id, peer.user);
    return [...byId.values()];
  }
  function focusRow(id: string | null): void {
    room?.setFocus(id ? `${area}:${id}` : null);
  }
  onBeforeUnmount(() => focusRow(null));
  return { editorsOf, focusRow };
}

/**
 * Ζωντανή ανανέωση: ξαναφορτώνει όταν κάποιος άλλος αλλάζει κάτι από τα
 * `topics` (βλ. `CollabChange.topic`). Όσο η σελίδα έχει δικές της αλλαγές που
 * δεν έχουν σωθεί (`busy`), περιμένει — ό,τι γράφεις δεν το πατάει η ανανέωση.
 * Χωρίς δωμάτιο (π.χ. σελίδα έξω από τη δράση) δεν κάνει τίποτα.
 */
export function useLiveReload(
  topics: readonly string[],
  reload: () => unknown,
  options: { busy?: () => boolean; subscribe?: SubscribeChanges | null } = {},
): void {
  const subscribe = options.subscribe !== undefined ? options.subscribe : (inject(LIVE_ROOM, null)?.subscribe ?? null);
  if (!subscribe) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const later = (delay: number): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (options.busy?.()) return later(700);
      void reload();
    }, delay);
  };
  // Μικρή αναμονή: μια σειρά αλλαγών (π.χ. αυτόματη κατανομή) φέρνει μία φόρτωση.
  const stop = subscribe((change) => {
    if (concernsMe(change, topics)) later(300);
  });
  onBeforeUnmount(() => {
    stop();
    if (timer) clearTimeout(timer);
  });
}

/**
 * Ζωντανή ανανέωση σελίδας του κλάδου ή του Τοπικού (μέλη, υλικό, ταμείο…):
 * ξαναφορτώνει όταν κάποιος άλλος αλλάζει κάτι σε μία από τις ενότητες του API
 * `topics` (`meloi`, `yliko`, `treasury`, …). Ό,τι γίνεται μέσα σε μια δράση
 * φτάνει ως `draseis`. Ίδιοι κανόνες με το `useLiveReload`.
 */
export function useTopikoReload(topics: readonly string[], reload: () => unknown, options: { busy?: () => boolean } = {}): void {
  useLiveReload(topics, reload, { ...options, subscribe: subscribeTopiko });
}
