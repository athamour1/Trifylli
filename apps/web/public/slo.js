/*
 * Front-channel Single Logout — τρέχει ΑΜΕΣΩΣ, πριν φορτώσει η εφαρμογή.
 *
 * Το Authentik φορτώνει το /auth/frontchannel-logout σε κρυφό iframe με πολύ
 * σύντομη ζωή· το βαρύ boot της PWA δεν προλαβαίνει. Γι' αυτό το σήμα σηκώνεται
 * εδώ, στο localStorage (κοινό σε όλες τις καρτέλες): η κύρια καρτέλα το ακούει
 * (storage event) κι αποσυνδέεται.
 *
 * Εξωτερικό αρχείο και όχι inline <script>: η CSP επιτρέπει μόνο `script-src
 * 'self'`, και ένα inline script θα χρειαζόταν hash που αλλάζει σε κάθε
 * επεξεργασία.
 *
 * ΜΟΝΟ αν το `iss` είναι το δικό μας Authentik. Χωρίς αυτόν τον έλεγχο, κάθε
 * ξένο site με ένα <iframe> σε αυτή τη διαδρομή θα αποσυνδέει όλους τους
 * χρήστες — τζάμπα DoS. Το `config.js` έχει ήδη φορτώσει (προηγείται).
 */
(function () {
  if (location.pathname !== '/auth/frontchannel-logout') return;
  try {
    var cfg = window.__APP_CONFIG__ || {};
    var authority = String(cfg.oidcAuthority || '').replace(/\/+$/, '');
    var iss = String(new URLSearchParams(location.search).get('iss') || '').replace(/\/+$/, '');
    if (!authority || !iss || iss !== authority) return;
    localStorage.setItem('trifylli:slo', String(Date.now()));
  } catch (e) {
    /* ιδιωτική περιήγηση — η κύρια καρτέλα αποσυνδέεται στην επόμενη ανανέωση */
  }
})();
