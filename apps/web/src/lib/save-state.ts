/**
 * Κατάσταση αυτόματης αποθήκευσης μιας οθόνης.
 *
 * Ζει εδώ και όχι μέσα στο `SaveStatus.vue`: το `<script setup>` δεν επιτρέπει
 * `export`, οπότε ο τύπος θα χρειαζόταν δύο αντίγραφα — ένα στο component και
 * ένα σε κάθε σελίδα που τον στέλνει.
 */
export type SaveState = 'clean' | 'pending' | 'saving' | 'saved' | 'offline' | 'error';
