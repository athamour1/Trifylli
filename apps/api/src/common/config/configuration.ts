import { z } from 'zod';

/**
 * Κενό string στο `.env` σημαίνει «δεν το έχω ρυθμίσει», όχι «άκυρη τιμή».
 * Χωρίς αυτό, ένα σχολιασμένο-αλλά-κενό `ESEO_BASE_URL=` ρίχνει την εκκίνηση.
 */
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/**
 * Επικύρωση περιβάλλοντος κατά την εκκίνηση. Προτιμάμε άμεση αποτυχία από
 * μισολειτουργικό API που σπάει στην πρώτη κλήση προς Authentik ή Ouchtracker.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().default('http://localhost:9000'),

  /**
   * Πόσοι reverse proxies μεσολαβούν (Express `trust proxy` ως hop count).
   *
   * `0` = κανένας, οπότε το `X-Forwarded-For` αγνοείται — σωστό για τοπική
   * ανάπτυξη, όπου όποιος φτάνει το API μπορεί να γράψει ό,τι header θέλει.
   * `1` = ένας proxy μπροστά (η παραγωγική στοίβα). Αριθμός και όχι `true`:
   * με `true` το Express εμπιστεύεται ΟΛΗ την αλυσίδα, άρα η IP «πλαστογραφείται»
   * με ένα ακόμη `X-Forwarded-For`. Από αυτό εξαρτώνται το rate limiting ανά IP
   * και οι IP στα logs.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /**
   * Το Swagger είναι χάρτης όλου του API· στην παραγωγή μένει κλειστό εκτός αν
   * ζητηθεί ρητά. Εκτός παραγωγής ανοίγει μόνο του.
   */
  SWAGGER_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  DATABASE_URL: z.string().url(),

  // ── Authentik (OIDC) ──
  /** Base URL του issuer, π.χ. http://localhost:9010/application/o/trifylli/ */
  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string().min(1),
  OIDC_JWKS_URI: z.string().url(),

  /**
   * Ο λογαριασμός που γίνεται υπερδιαχειριστής την πρώτη φορά που θα συνδεθεί.
   *
   * Είναι το μοναδικό σημείο όπου ρόλος δίνεται από το περιβάλλον: από εκεί και
   * πέρα τους λογαριασμούς τους φτιάχνει ο υπερδιαχειριστής μέσα στην εφαρμογή.
   * Χωρίς αυτό, ένα φρέσκο στήσιμο δεν θα είχε κανέναν που να μπορεί να μπει.
   */
  SUPER_ADMIN_EMAIL: z.string().email().optional(),

  /**
   * Admin API του Authentik — για πρόσκληση νέου λογαριασμού και επαναφορά
   * κωδικού (το API ζητά να σταλεί σύνδεσμος ορισμού κωδικού στο email).
   *
   * Προαιρετικά: χωρίς αυτά οι λογαριασμοί δημιουργούνται κανονικά, απλώς δεν
   * φεύγει email — ο υπερδιαχειριστής το κάνει χειροκίνητα από το Authentik.
   * Σε docker βάλε το **εσωτερικό** URL (http://authentik-server:9000).
   */
  AUTHENTIK_API_URL: blankToUndefined(z.string().url()),
  AUTHENTIK_API_TOKEN: blankToUndefined(z.string()),
  /** Το email stage της ροής `trifylli-recovery` (blueprint). */
  AUTHENTIK_RECOVERY_EMAIL_STAGE: z.string().default('trifylli-recovery-email'),

  /**
   * Παρακάμπτει την επικύρωση JWT και δουλεύει με έναν υπαρκτό λογαριασμό της
   * βάσης. Επιτρέπεται **μόνο** εκτός production — ο έλεγχος είναι παρακάτω.
   */
  DEV_AUTH_BYPASS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  /** Το email του λογαριασμού με τον οποίο «συνδέεται» η dev συνεδρία. */
  DEV_AUTH_EMAIL: z.string().default('admin@trifylli.local'),

  // ── Ouchtracker ──
  // Ouchtracker: JWT login (email/password) — δεν έχει static API key.
  OUCHTRACKER_BASE_URL: blankToUndefined(z.string().url()),
  OUCHTRACKER_EMAIL: blankToUndefined(z.string()),
  OUCHTRACKER_PASSWORD: blankToUndefined(z.string()),

  // ── e-SEO (eseo.seo.gr — Keycloak OIDC + Spring REST) ──
  /**
   * Ρίζα του eSEO **χωρίς** το `/api`, π.χ. `https://eseo.seo.gr/app/eseo`.
   * Από εκεί χτίζονται και το token endpoint (`/auth/realms/...`) και το REST
   * (`/api/member/`).
   */
  ESEO_BASE_URL: blankToUndefined(z.string().url()),
  /** Keycloak realm — στην παραγωγή είναι `eseo`. */
  ESEO_REALM: z.string().default('eseo'),
  /** Public client του Keycloak (χωρίς secret, PKCE/direct grant). */
  ESEO_CLIENT_ID: z.string().default('ssoClient'),
  /**
   * Offline refresh token (`scope=offline_access`). Είναι το **μοναδικό**
   * μυστικό που αποθηκεύουμε — όχι ο κωδικός του στελέχους. Πάρ' το μία φορά με:
   *   `node apps/api/scripts/eseo-offline-token.mjs`
   * Με αυτό ο sync engine ανταλλάσσει access tokens χωρίς παρουσία χρήστη.
   */
  ESEO_REFRESH_TOKEN: blankToUndefined(z.string()),
  /** Μυστικό υπογραφής webhook· χωρίς αυτό το endpoint επιστρέφει 503. */
  ESEO_WEBHOOK_SECRET: blankToUndefined(z.string()),
  /** Cron expression για τον περιοδικό συγχρονισμό μητρώου. */
  ESEO_SYNC_CRON: z.string().default('0 4 * * *'),
  SYNC_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // ── Object storage (S3 / Garage) ──
  // Προαιρετικά: χωρίς αυτά η εφαρμογή σηκώνεται κανονικά, αλλά τα endpoints
  // αρχείων επιστρέφουν σφάλμα «δεν έχει ρυθμιστεί».
  S3_ENDPOINT: blankToUndefined(z.string().url()),
  S3_REGION: z.string().default('garage'),
  S3_BUCKET: z.string().default('trifylli'),
  S3_ACCESS_KEY_ID: blankToUndefined(z.string()),
  S3_SECRET_ACCESS_KEY: blankToUndefined(z.string()),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Άκυρο περιβάλλον εκτέλεσης:\n${issues}`);
  }

  const config = parsed.data;
  if (config.NODE_ENV === 'production' && config.DEV_AUTH_BYPASS) {
    throw new Error('DEV_AUTH_BYPASS=true απαγορεύεται σε production.');
  }
  return config;
}

export function corsOrigins(config: AppConfig): string[] {
  return config.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
