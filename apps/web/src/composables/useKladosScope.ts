import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { KladosType } from '@trifylli/shared';
import { useAuthStore } from '../stores/auth';

/**
 * Ο κλάδος στον οποίο «βρίσκεται» η σελίδα.
 *
 * Οι ίδιες σελίδες εξυπηρετούν δύο προβολές: μέσα σε κλάδο (`/k/:klados/...`,
 * όπου ο κλάδος είναι δεδομένος και δεν επιλέγεται) και σε επίπεδο Τοπικού
 * (όπου ο υπερδιαχειριστής βλέπει τα πάντα). Αντί για δύο σετ σελίδων, η
 * διαφορά είναι μία τιμή.
 */
export function useKladosScope() {
  const route = useRoute();
  const auth = useAuthStore();

  /** `null` σε προβολή Τοπικού. */
  const klados = computed<KladosType | null>(() => {
    const param = route.params.klados as KladosType | undefined;
    if (!param) return null;
    // Παράμετρος εκτός εμβέλειας δεν πρέπει να στέλνει ερώτημα που θα φάει 403·
    // το API θα το έκοβε ούτως ή άλλως, αλλά έτσι η οθόνη δεν αναβοσβήνει.
    return auth.seesKlados(param) ? param : null;
  });

  const inKlados = computed(() => klados.value !== null);

  const label = computed(() =>
    klados.value ? (auth.kladoi.find((k) => k.type === klados.value)?.label ?? '') : 'Τοπικό',
  );

  /** Επιλογές για dropdown — χρησιμοποιούνται μόνο στην προβολή Τοπικού. */
  const options = computed(() => auth.kladoi.map((k) => ({ label: k.label, value: k.type })));

  return { klados, inKlados, label, options };
}
