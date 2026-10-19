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
  /** DSN του project της PWA στο GlitchTip· κενό = χωρίς error tracking. */
  sentryDsn?: string;
  sentryEnvironment?: string;
  /** `true`/`false`: tracing, breadcrumbs, logs, αναφορά προβλήματος (ROADMAP §6). */
  sentryExtras?: string;
  sentryTracesSampleRate?: string;
  /** OpenReplay: η βάση (π.χ. https://replay.example.gr) και το project key· κενά = χωρίς replay. */
  openreplayUrl?: string;
  openreplayProjectKey?: string;
  /** Umami: η βάση και το website id· κενά = χωρίς analytics. */
  umamiUrl?: string;
  umamiWebsiteId?: string;
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
export const SENTRY_DSN = c.sentryDsn || process.env.SENTRY_DSN || '';
export const SENTRY_ENVIRONMENT =
  c.sentryEnvironment || process.env.SENTRY_ENVIRONMENT || (process.env.DEV ? 'development' : 'production');
/** Χωρίς τιμή: ανοιχτά στο `quasar dev`, κλειστά αλλού (το image τα ορίζει ρητά). */
export const SENTRY_EXTRAS = (c.sentryExtras || process.env.SENTRY_EXTRAS || (process.env.DEV ? 'true' : '')) === 'true';
const sampleRate = Number(c.sentryTracesSampleRate || process.env.SENTRY_TRACES_SAMPLE_RATE || '1');
export const SENTRY_TRACES_SAMPLE_RATE = Number.isFinite(sampleRate) ? Math.min(Math.max(sampleRate, 0), 1) : 1;
export const OPENREPLAY_URL = (c.openreplayUrl || process.env.OPENREPLAY_URL || '').replace(/\/$/, '');
export const OPENREPLAY_PROJECT_KEY = c.openreplayProjectKey || process.env.OPENREPLAY_PROJECT_KEY || '';
export const UMAMI_URL = (c.umamiUrl || process.env.UMAMI_URL || '').replace(/\/$/, '');
export const UMAMI_WEBSITE_ID = c.umamiWebsiteId || process.env.UMAMI_WEBSITE_ID || '';
