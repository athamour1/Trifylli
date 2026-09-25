import { defineBoot } from '#q-app/wrappers';
import { useSessionStore } from '../stores/session';

/**
 * Αρχικοποιεί τη συνεδρία OIDC πριν τρέξει ο πρώτος router guard.
 *
 * Το προφίλ του Trifylli (`auth.load()`) **δεν** φορτώνεται εδώ: χωρίς έγκυρο
 * token θα γύριζε 401 και θα κρατούσε το σφάλμα στο store, με αποτέλεσμα η
 * σελίδα σύνδεσης να δείχνει λάθος μήνυμα. Το φορτώνει ο guard, αφού υπάρξει
 * συνεδρία.
 */
export default defineBoot(async () => {
  await useSessionStore().init();
});
