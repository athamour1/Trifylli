import { ref, watch } from 'vue';
import { Dark } from 'quasar';

/**
 * Φωτεινό / σκοτεινό θέμα.
 *
 * Η προτίμηση είναι **της συσκευής**, όχι του λογαριασμού: στο κινητό στην
 * κατασκήνωση το βράδυ θέλεις σκοτεινό, στον υπολογιστή του γραφείου όχι —
 * και ο ίδιος λογαριασμός ανοίγει και στα δύο. Γι' αυτό `localStorage` και όχι
 * προφίλ στο API.
 *
 * Το «Αυτόματο» ακολουθεί το `prefers-color-scheme` του λειτουργικού και
 * αλλάζει ζωντανά· το αναλαμβάνει η ίδια η Quasar (`Dark.set('auto')`).
 */
export type ThemePref = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'trifylli.theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** Τι διάλεξε ο χρήστης. */
export const themePref = ref<ThemePref>(readPref());

/** Τι ισχύει αυτή τη στιγμή στην οθόνη (στο «Αυτόματο» μπορεί να διαφέρει από την προτίμηση). */
export const isDark = ref(false);

function apply(): void {
  Dark.set(themePref.value === 'auto' ? 'auto' : themePref.value === 'dark');
}

export function setThemePref(pref: ThemePref): void {
  themePref.value = pref;
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Ιδιωτικό παράθυρο ή γεμάτος χώρος: η επιλογή ισχύει ως το κλείσιμο της καρτέλας.
  }
  apply();
}

/** Καλείται μία φορά στο boot, πριν ζωγραφιστεί οτιδήποτε. */
export function initTheme(): void {
  apply();
  watch(
    () => Dark.isActive,
    (active) => {
      isDark.value = active;
      // Scrollbars, native selects, date pickers του browser: να ακολουθούν κι αυτά.
      document.documentElement.style.colorScheme = active ? 'dark' : 'light';
    },
    { immediate: true },
  );
}
