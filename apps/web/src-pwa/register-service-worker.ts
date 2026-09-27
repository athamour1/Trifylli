import { register } from 'register-service-worker';
import { Notify } from 'quasar';

// Το Quasar ορίζει πάντα αυτή τη μεταβλητή σε PWA build· το fallback είναι
// για να ικανοποιηθεί ο τύπος, όχι για πραγματική περίπτωση.
register(process.env.SERVICE_WORKER_FILE ?? 'sw.js', {
  registrationOptions: { scope: './' },

  updated() {
    // Στην κατασκήνωση μια αυτόματη ανανέωση μπορεί να χάσει μισοσυμπληρωμένο
    // παρουσιολόγιο· ο χρήστης αποφασίζει πότε θα φορτώσει τη νέα έκδοση.
    Notify.create({
      type: 'info',
      message: 'Υπάρχει νέα έκδοση.',
      timeout: 0,
      actions: [
        { label: 'Ανανέωση', color: 'white', handler: () => window.location.reload() },
        { label: 'Αργότερα', color: 'white' },
      ],
    });
  },

  offline() {
    Notify.create({
      type: 'warning',
      icon: 'cloud_off',
      message: 'Λειτουργία χωρίς σύνδεση.',
    });
  },

  error(err) {
    console.error('Σφάλμα service worker:', err);
  },
});
