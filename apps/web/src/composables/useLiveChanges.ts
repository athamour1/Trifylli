import type { CollabChange } from '@trifylli/shared';
import { inject, onBeforeUnmount, provide, type InjectionKey } from 'vue';
import { concernsMe } from '../lib/live-changes';

/** «Άκου τα άλλαξε-αυτό» — επιστρέφει το «σταμάτα» (βλ. `useCollabDoc().onChange`). */
export type SubscribeChanges = (handler: (change: CollabChange) => void) => () => void;

const LIVE_CHANGES: InjectionKey<SubscribeChanges> = Symbol('live-changes');

/** Η σελίδα που ανοίγει το δωμάτιο (π.χ. η δράση) το δίνει στις καρτέλες της. */
export function provideLiveChanges(subscribe: SubscribeChanges): void {
  provide(LIVE_CHANGES, subscribe);
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
  const subscribe = options.subscribe ?? inject(LIVE_CHANGES, null);
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
