import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { KladosType } from '@trifylli/shared';
import { paintKladosVars } from '../lib/klados-theme';
import { isDark } from '../lib/theme';

/**
 * Σελίδες λεπτομέρειας εκτός `/k/:klados`: ο κλάδος τους δεν είναι στη διαδρομή,
 * τον δηλώνει η ίδια η σελίδα μόλις φορτώσει.
 */
const DETAIL_ROUTES = new Set(['drasi', 'drasi-programmatiko', 'syggentrwsh', 'parousiologio', 'symvoulio', 'melos', 'yliko-item']);

/**
 * Ο κλάδος που βάφει τη σελίδα.
 *
 * Πριν, κάθε πλοήγηση καθάριζε το χρώμα και η σελίδα λεπτομέρειας το ξανάβαφε
 * όταν έφταναν τα δεδομένα της — στο ενδιάμεσο η εφαρμογή αναβόσβηνε πράσινη.
 * Τώρα, σε σελίδα λεπτομέρειας, κρατάμε το χρώμα που ήδη ξέρουμε: όσα έχουμε
 * δει ξανά ανοίγουν κατευθείαν στο σωστό, τα καινούρια κρατούν το τρέχον
 * (συνήθως ερχόμαστε από τη λίστα του ίδιου κλάδου) μέχρι να δηλωθούν.
 */
export const useKladosThemeStore = defineStore('kladosTheme', () => {
  const klados = ref<KladosType | null>(null);
  /** Κλάδος ανά σελίδα λεπτομέρειας (`όνομα:id`) που έχουμε ήδη ανοίξει. */
  const known = new Map<string, KladosType | null>();
  let detailKey: string | null = null;

  /** Από το layout, σε κάθε αλλαγή διαδρομής. */
  function follow(route: RouteLocationNormalizedLoaded, routeKlados: KladosType | null): void {
    const name = String(route.name ?? '');
    if (!DETAIL_ROUTES.has(name)) {
      detailKey = null;
      klados.value = routeKlados;
      return;
    }
    detailKey = `${name}:${String(route.params.id ?? '')}`;
    if (known.has(detailKey)) klados.value = known.get(detailKey) ?? null;
  }

  /**
   * Από τη σελίδα, όταν μάθει τον κλάδο της. `undefined` = «ακόμα φορτώνει»
   * και δεν αγγίζει τίποτα· `null` = σελίδα Τοπικού, χωρίς κλάδο.
   */
  function declare(value: KladosType | null | undefined): void {
    if (value === undefined) return;
    klados.value = value;
    if (detailKey) known.set(detailKey, klados.value);
  }

  // Οι μεταβλητές στο `body` είναι inline και δεν ξέρουν από θέμα· τις
  // ξαναγράφουμε και με κάθε εναλλαγή φωτεινού/σκοτεινού.
  watch([klados, isDark], () => paintKladosVars(klados.value), { immediate: true });

  return { klados, follow, declare };
});
