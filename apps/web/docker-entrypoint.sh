#!/bin/sh
# Τρέχει από τον entrypoint του nginx (/docker-entrypoint.d) πριν ξεκινήσει ο
# server. Δύο δουλειές, και οι δύο «runtime, όχι build-time»:
#   1. γράφει το /config.js από μεταβλητές περιβάλλοντος (ίδια image παντού),
#   2. αποδίδει το nginx config με Content-Security-Policy που ξέρει ποια είναι
#      τα origins του API και του Authentik — δεν μπορούν να είναι καρφωμένα.
set -e

API_URL="${API_URL:-http://localhost:3000/api}"
OIDC_AUTHORITY="${OIDC_AUTHORITY:-}"
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-}"
OIDC_LOGOUT_FLOW="${OIDC_LOGOUT_FLOW:-trifylli-invalidation}"
OUCHTRACKER_URL="${OUCHTRACKER_URL:-}"
# Error tracking (GlitchTip): το DSN του project της PWA· κενό = ανενεργό.
SENTRY_DSN="${SENTRY_DSN:-}"
SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-production}"
# Tracing, breadcrumbs, logs, «Αναφορά προβλήματος» — όσο το σύστημα είναι σε
# ενεργή ανάπτυξη (ROADMAP §6). `false` τα κλείνει.
SENTRY_EXTRAS="${SENTRY_EXTRAS:-false}"
SENTRY_TRACES_SAMPLE_RATE="${SENTRY_TRACES_SAMPLE_RATE:-1}"
# Οι παραβιάσεις CSP πάνε στο API (που κόβει tokens και τις προωθεί στο
# GlitchTip — CSP_REPORT_FORWARD_URL στο API). `off` = καμία αναφορά.
CSP_REPORT_URI="${CSP_REPORT_URI:-${API_URL%/}/csp-report}"
# Καταγραφή συνεδριών (OpenReplay) και ανώνυμα analytics (Umami): η βάση του
# καθενός και το κλειδί του· κενά = ανενεργά (ROADMAP §6, docs/monitoring.md §5).
OPENREPLAY_URL="${OPENREPLAY_URL:-}"
OPENREPLAY_PROJECT_KEY="${OPENREPLAY_PROJECT_KEY:-}"
UMAMI_URL="${UMAMI_URL:-}"
UMAMI_WEBSITE_ID="${UMAMI_WEBSITE_ID:-}"

# ── 1. config.js ──
# Οι τιμές μπαίνουν μέσα σε JS string: ό,τι θα έσπαγε το literal (\ ' < newline)
# γίνεται escape. Οι τιμές είναι του διαχειριστή, αλλά ένα `'` σε ένα URL
# δεν πρέπει να σημαίνει «λευκή οθόνη».
js_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g" -e 's/</\\u003c/g' | tr -d '\n\r'
}

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  apiUrl: '$(js_escape "$API_URL")',
  oidcAuthority: '$(js_escape "$OIDC_AUTHORITY")',
  oidcClientId: '$(js_escape "$OIDC_CLIENT_ID")',
  oidcLogoutFlow: '$(js_escape "$OIDC_LOGOUT_FLOW")',
  ouchtrackerUrl: '$(js_escape "$OUCHTRACKER_URL")',
  sentryDsn: '$(js_escape "$SENTRY_DSN")',
  sentryEnvironment: '$(js_escape "$SENTRY_ENVIRONMENT")',
  sentryExtras: '$(js_escape "$SENTRY_EXTRAS")',
  sentryTracesSampleRate: '$(js_escape "$SENTRY_TRACES_SAMPLE_RATE")',
  openreplayUrl: '$(js_escape "$OPENREPLAY_URL")',
  openreplayProjectKey: '$(js_escape "$OPENREPLAY_PROJECT_KEY")',
  umamiUrl: '$(js_escape "$UMAMI_URL")',
  umamiWebsiteId: '$(js_escape "$UMAMI_WEBSITE_ID")',
};
EOF

# ── 2. nginx config με CSP ──
# Από ένα URL κρατάμε μόνο το origin (scheme://host[:port]). Σχετικό URL
# (π.χ. `/api`) σημαίνει ίδιο origin — καλύπτεται από το 'self'.
origin_of() {
  printf '%s' "$1" | sed -nE 's#^(https?://[^/]+).*#\1#p'
}
API_ORIGIN="$(origin_of "$API_URL")"
SSO_ORIGIN="$(origin_of "$OIDC_AUTHORITY")"
# Το WebSocket της συνεργασίας (`…/api/collab`) ζει στο host του API. Ένα https://
# origin δεν καλύπτει το wss:// σε όλους τους browsers — μπαίνει ρητά.
COLLAB_ORIGIN="$(printf '%s' "$API_ORIGIN" | sed -E 's#^http#ws#')"
# Το DSN έχει μέσα το κλειδί (https://<κλειδί>@errors.…/1)· στο CSP μόνο το origin.
ERRORS_ORIGIN="$(printf '%s' "$SENTRY_DSN" | sed -nE 's#^(https?://)([^@/]*@)?([^/]+).*#\1\3#p')"
REPLAY_ORIGIN=""
[ -n "$OPENREPLAY_PROJECT_KEY" ] && REPLAY_ORIGIN="$(origin_of "$OPENREPLAY_URL")"
ANALYTICS_ORIGIN=""
[ -n "$UMAMI_WEBSITE_ID" ] && ANALYTICS_ORIGIN="$(origin_of "$UMAMI_URL")"
# Ο tracker του OpenReplay τρέχει σε Web Worker από blob: — μόνο όταν είναι ενεργός.
WORKER_BLOB=""
[ -n "$REPLAY_ORIGIN" ] && WORKER_BLOB=" blob:"

# Τι επιτρέπεται και γιατί:
#   script-src 'self'            — κανένα inline script (το SLO είναι εξωτερικό /slo.js)
#   style-src 'unsafe-inline'    — τα style attributes του Vue/Quasar
#   img-src data: blob:          — avatars (data:) και εικόνες markdown που
#                                  κατεβαίνουν με auth και γίνονται blob URL
#   connect-src API + SSO        — fetch στο API και στο token endpoint
#               (+ ws/wss του API) — η συνεργασία σε πραγματικό χρόνο
#               (+ error tracking) — και τα σφάλματα προς το GlitchTip, αν υπάρχει DSN
#   frame-src 'self' + SSO       — το κρυφό iframe σιωπηλής ανανέωσης: ξεκινά
#                                  στο Authentik και γυρίζει στο /auth/silent
#   form-action 'self' + SSO     — η ροή σύνδεσης υποβάλλει στο Authentik
#   object-src 'none'            — κανένα plugin, ποτέ
#   report-uri                   — οι παραβιάσεις στο API → GlitchTip
#   script/connect + analytics   — ο tracker του Umami και οι αποστολές του
#   connect + replay, worker blob: — ο tracker του OpenReplay (Web Worker από blob)
CSP_REPORT=""
[ "$CSP_REPORT_URI" = off ] || CSP_REPORT=" report-uri $CSP_REPORT_URI;"
CSP_BASE="default-src 'self'; script-src 'self'${ANALYTICS_ORIGIN:+ $ANALYTICS_ORIGIN}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${API_ORIGIN:+ $API_ORIGIN}${COLLAB_ORIGIN:+ $COLLAB_ORIGIN}${SSO_ORIGIN:+ $SSO_ORIGIN}${ERRORS_ORIGIN:+ $ERRORS_ORIGIN}${REPLAY_ORIGIN:+ $REPLAY_ORIGIN}${ANALYTICS_ORIGIN:+ $ANALYTICS_ORIGIN}; frame-src 'self'${SSO_ORIGIN:+ $SSO_ORIGIN}; worker-src 'self'${WORKER_BLOB}; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'${SSO_ORIGIN:+ $SSO_ORIGIN};${CSP_REPORT}"
FRAME_ANCESTORS_SLO="${SSO_ORIGIN:-'none'}"
export CSP_BASE FRAME_ANCESTORS_SLO

envsubst '${CSP_BASE} ${FRAME_ANCESTORS_SLO}' \
  < /opt/trifylli/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "[entrypoint] config.js written — api=${API_URL} oidc=${OIDC_CLIENT_ID:-(off)} ouch=${OUCHTRACKER_URL:-(off)} errors=${ERRORS_ORIGIN:-(off)}"
echo "[entrypoint] CSP — connect/frame: ${API_ORIGIN:-self} ${COLLAB_ORIGIN:-} ${SSO_ORIGIN:-(no sso)} replay=${REPLAY_ORIGIN:-(off)} analytics=${ANALYTICS_ORIGIN:-(off)}"

# ── 3. source maps στο GlitchTip ──
# Με token, ανεβαίνουν στο project της PWA για το release αυτού του image — στο
# παρασκήνιο, ώστε ο nginx να μην περιμένει. Το URL είναι το ΔΗΜΟΣΙΟ του
# GlitchTip (GLITCHTIP_DOMAIN): εκεί δείχνουν τα URL που επιστρέφει για το upload.
# Ίδια αρχεία σε κάθε εκκίνηση· το GlitchTip αντικαθιστά τα παλιά (ίδιο debug id).
if [ -n "${SOURCEMAP_UPLOAD_TOKEN:-}" ] && [ -n "${SOURCEMAP_UPLOAD_URL:-}" ] && [ -f /opt/trifylli/sourcemaps/VERSION ]; then
  (
    release="trifylli-web@$(cat /opt/trifylli/sourcemaps/VERSION)"
    if SENTRY_URL="$SOURCEMAP_UPLOAD_URL" SENTRY_AUTH_TOKEN="$SOURCEMAP_UPLOAD_TOKEN" \
      SENTRY_ORG="${SOURCEMAP_UPLOAD_ORG:-trifylli}" SENTRY_PROJECT="${SOURCEMAP_UPLOAD_PROJECT:-pwa}" \
      sentry-cli sourcemaps upload --release "$release" /opt/trifylli/sourcemaps > /tmp/sourcemaps.log 2>&1; then
      echo "[entrypoint] source maps: ανέβηκαν ($release)"
    else
      echo "[entrypoint] source maps: αποτυχία — δες /tmp/sourcemaps.log" >&2
    fi
  ) &
fi
