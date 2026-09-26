import { ref, shallowRef, watch, type WatchSource } from 'vue';
import { useOfflineStore } from '../stores/offline';

interface AsyncDataOptions {
  /** Κλειδί cache· χωρίς αυτό δεν αποθηκεύεται τίποτα τοπικά. */
  cacheKey?: string;
  /**
   * Πηγές που, όταν αλλάζουν, ξαναφορτώνουν: refs ή ένα ολόκληρο `reactive`
   * αντικείμενο φίλτρων (παρακολουθείται σε βάθος).
   */
  watchSources?: (WatchSource<unknown> | object)[];
  immediate?: boolean;
}

/**
 * Φόρτωση δεδομένων με offline εφεδρεία.
 *
 * Το `stale` είναι το σημαντικό: όταν δεν υπάρχει δίκτυο η οθόνη δείχνει την
 * τελευταία γνωστή εικόνα και το λέει, αντί να μείνει άδεια ή να ψευτίσει.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, options: AsyncDataOptions = {}) {
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const stale = ref(false);
  const offline = useOfflineStore();

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      if (options.cacheKey) {
        const result = await offline.cachedGet(options.cacheKey, fetcher);
        data.value = result.data;
        stale.value = result.stale;
      } else {
        data.value = await fetcher();
        stale.value = false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  if (options.watchSources?.length) {
    watch(options.watchSources, () => void load(), { deep: true });
  }
  if (options.immediate !== false) void load();

  return { data, loading, error, stale, reload: load };
}
