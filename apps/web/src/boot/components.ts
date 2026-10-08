import { defineBoot } from '#q-app/wrappers';
import SegmentedToggle from '../components/SegmentedToggle.vue';

/**
 * Καθολικά components της εφαρμογής — όσα αντικαθιστούν ένα component της
 * Quasar παντού (εδώ: το q-btn-toggle), ώστε να μη χρειάζεται import σε κάθε
 * σελίδα. Οι τύποι τους δηλώνονται στο `components.d.ts`.
 */
export default defineBoot(({ app }) => {
  app.component('SegmentedToggle', SegmentedToggle);
});
