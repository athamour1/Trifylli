#!/bin/sh
# Γράφει το /config.js από μεταβλητές περιβάλλοντος σε κάθε εκκίνηση, ώστε η
# ίδια PWA image να ρυθμίζεται ανά περιβάλλον χωρίς rebuild. Τρέχει από τον
# entrypoint του nginx (φάκελος /docker-entrypoint.d) και ΔΕΝ ξεκινά το nginx
# — αυτό το κάνει ο βασικός entrypoint μετά.
set -e

API_URL="${API_URL:-http://localhost:3000/api}"
OIDC_AUTHORITY="${OIDC_AUTHORITY:-}"
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-}"
OIDC_LOGOUT_FLOW="${OIDC_LOGOUT_FLOW:-trifylli-invalidation}"
OUCHTRACKER_URL="${OUCHTRACKER_URL:-}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  apiUrl: '${API_URL}',
  oidcAuthority: '${OIDC_AUTHORITY}',
  oidcClientId: '${OIDC_CLIENT_ID}',
  oidcLogoutFlow: '${OIDC_LOGOUT_FLOW}',
  ouchtrackerUrl: '${OUCHTRACKER_URL}',
};
EOF

echo "[entrypoint] config.js written — api=${API_URL} oidc=${OIDC_CLIENT_ID:-(off)} ouch=${OUCHTRACKER_URL:-(off)}"
