/**
 * Κατάσταση αυτόματης αποθήκευσης μιας οθόνης.
 *
 * Ζει εδώ και όχι μέσα στο `SaveStatus.vue`: το `<script setup>` δεν επιτρέπει
 * `export`, οπότε ο τύπος θα χρειαζόταν δύο αντίγραφα — ένα στο component και
 * ένα σε κάθε σελίδα που τον στέλνει.
 */
export type SaveState = 'clean' | 'pending' | 'saving' | 'saved' | 'offline' | 'error';

/** Από το χειρότερο στο καλύτερο: μία ένδειξη για σελίδα με δύο τρόπους αποθήκευσης. */
const SEVERITY: readonly SaveState[] = ['error', 'offline', 'saving', 'pending', 'saved', 'clean'];

/** Η ένδειξη που πρέπει να δει ο χρήστης όταν σώζουν δύο μηχανισμοί μαζί (π.χ. φόρμα + κοινό έγγραφο). */
export function worstSaveState(...states: SaveState[]): SaveState {
  return SEVERITY.find((state) => states.includes(state)) ?? 'clean';
}
