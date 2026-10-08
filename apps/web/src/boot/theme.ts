import { defineBoot } from '#q-app/wrappers';
import { initTheme } from '../lib/theme';

// Πριν από το πρώτο render: αλλιώς η σελίδα ανάβει λευκή και μετά σκοτεινιάζει.
export default defineBoot(() => {
  initTheme();
});
