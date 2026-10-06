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

# Τι επιτρέπεται και γιατί:
#   script-src 'self'            — κανένα inline script (το SLO είναι εξωτερικό /slo.js)
#   style-src 'unsafe-inline'    — τα style attributes του Vue/Quasar
#   img-src data: blob:          — avatars (data:) και εικόνες markdown που
#                                  κατεβαίνουν με auth και γίνονται blob URL
#   connect-src API + SSO        — fetch στο API και στο token endpoint
#   frame-src 'self' + SSO       — το κρυφό iframe σιωπηλής ανανέωσης: ξεκινά
#                                  στο Authentik και γυρίζει στο /auth/silent
#   form-action 'self' + SSO     — η ροή σύνδεσης υποβάλλει στο Authentik
#   object-src 'none'            — κανένα plugin, ποτέ
CSP_BASE="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${API_ORIGIN:+ $API_ORIGIN}${SSO_ORIGIN:+ $SSO_ORIGIN}; frame-src 'self'${SSO_ORIGIN:+ $SSO_ORIGIN}; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'${SSO_ORIGIN:+ $SSO_ORIGIN};"
FRAME_ANCESTORS_SLO="${SSO_ORIGIN:-'none'}"
export CSP_BASE FRAME_ANCESTORS_SLO

envsubst '${CSP_BASE} ${FRAME_ANCESTORS_SLO}' \
  < /opt/trifylli/nginx.conf.template > /etc/nginx/conf.d/default.conf

echo "[entrypoint] config.js written — api=${API_URL} oidc=${OIDC_CLIENT_ID:-(off)} ouch=${OUCHTRACKER_URL:-(off)}"
echo "[entrypoint] CSP — connect/frame: ${API_ORIGIN:-self} ${SSO_ORIGIN:-(no sso)}"
