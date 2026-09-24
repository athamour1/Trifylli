/**
 * Ρυθμίσεις χρόνου εκτέλεσης (όχι build-time).
 *
 * Η PWA διανέμεται ως ΕΝΑ image· οι ανά-περιβάλλον τιμές (API, OIDC, OuchTracker)
 * γράφονται στο `window.__APP_CONFIG__` από τον entrypoint του container
 * (`/config.js`), ώστε να αλλάζουν χωρίς rebuild — όπως στο OuchTracker.
 *
 * Σειρά προτεραιότητας: runtime (`config.js`) → build-time (`process.env`, για
 * `quasar dev`) → ασφαλές default. Κενές runtime τιμές «πέφτουν» στο build-time,
 * οπότε στο dev δεν χρειάζεται config.js.
 */
interface RuntimeConfig {
  apiUrl?: string;
  oidcAuthority?: string;
  oidcClientId?: string;
  oidcLogoutFlow?: string;
  ouchtrackerUrl?: string;
}

function raw(): RuntimeConfig {
  if (typeof window === 'undefined') return {};
  return (window as unknown as { __APP_CONFIG__?: RuntimeConfig }).__APP_CONFIG__ ?? {};
}

const c = raw();

export const API_URL = c.apiUrl || process.env.API_URL || 'http://localhost:3000/api';
export const OIDC_AUTHORITY = c.oidcAuthority || process.env.OIDC_AUTHORITY || '';
export const OIDC_CLIENT_ID = c.oidcClientId || process.env.OIDC_CLIENT_ID || '';
export const OIDC_LOGOUT_FLOW = c.oidcLogoutFlow || process.env.OIDC_LOGOUT_FLOW || 'trifylli-invalidation';
export const OUCHTRACKER_URL = c.ouchtrackerUrl || process.env.OUCHTRACKER_URL || '';
