import { register } from 'register-service-worker';
import { Notify } from 'quasar';

// Το Quasar ορίζει πάντα αυτή τη μεταβλητή σε PWA build· το fallback είναι
// για να ικανοποιηθεί ο τύπος, όχι για πραγματική περίπτωση.
// Χωρίς ρητό `scope`: το προεπιλεγμένο είναι ο φάκελος του sw.js, δηλαδή η
// ρίζα. Το `'./'` λυνόταν σε σχέση με τη ΣΕΛΙΔΑ που έκανε την εγγραφή, οπότε
// κάθε βάθος διαδρομής (/auth/, /draseis/<id>/…) δημιουργούσε δεύτερη εγγραφή
// και το `updated` έβγαζε «Υπάρχει νέα έκδοση» σε ολοκαίνουργιο browser.
register(process.env.SERVICE_WORKER_FILE ?? 'sw.js', {
  updated() {
    // Στην κατασκήνωση μια αυτόματη ανανέωση μπορεί να χάσει μισοσυμπληρωμένο
    // παρουσιολόγιο· ο χρήστης αποφασίζει πότε θα φορτώσει τη νέα έκδοση.
    // Στο χρώμα του κλάδου της σελίδας (`bg-klados`), όχι στο μπλε του `info`·
    // το `klados-on` κρατά το κείμενο ευανάγνωστο και στο κίτρινο των Πουλιών.
    // Κάτω, όχι πάνω όπως οι υπόλοιπες ειδοποιήσεις: μένει ανοιχτή μέχρι να
    // απαντήσει ο χρήστης και δεν πρέπει να κρύβει την κεφαλίδα της σελίδας.
    Notify.create({
      position: 'bottom',
      color: 'klados',
      textColor: 'klados-on',
      icon: 'info',
      message: 'Υπάρχει νέα έκδοση.',
      timeout: 0,
      actions: [
        { label: 'Ανανέωση', color: 'klados-on', handler: () => window.location.reload() },
        { label: 'Αργότερα', color: 'klados-on' },
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
