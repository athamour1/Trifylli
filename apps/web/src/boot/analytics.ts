import { defineBoot } from '#q-app/wrappers';
import { startAnalytics } from '../lib/analytics';

/** Ανώνυμα analytics (Umami) — μόνο αν το `config.js` έχει URL και website id. */
export default defineBoot(() => {
  startAnalytics();
});
