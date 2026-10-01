#!/usr/bin/env bash
# Στήνει το Authentik για το Trifylli: εφαρμόζει το blueprint (provider +
# application) και δημιουργεί χρήστες ανάπτυξης που αντιστοιχούν στους
# λογαριασμούς του seed.
#
# Είναι idempotent — τρέχει ξανά χωρίς διπλότυπα.
#
#   ./infra/authentik/setup.sh
#
# Οι χρήστες που δημιουργεί είναι **μόνο για development**: το Authentik είναι η
# πηγή ταυτότητας σε πραγματικό στήσιμο και οι χρήστες μπαίνουν από εκεί.
set -euo pipefail

AUTHENTIK_URL="${AUTHENTIK_URL:-http://localhost:9010}"
TOKEN="${AUTHENTIK_BOOTSTRAP_TOKEN:-trifylli-dev-bootstrap-token}"
DEV_PASSWORD="${AUTHENTIK_DEV_PASSWORD:-trifylli-dev}"

api() {
  local method=$1 path=$2
  shift 2
  curl -sS -X "$method" "$AUTHENTIK_URL/api/v3$path" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' "$@"
}

echo "→ Αναμονή για το Authentik"
for _ in $(seq 1 120); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$AUTHENTIK_URL/-/health/ready/" || true)
  [ "$code" = "200" ] || [ "$code" = "204" ] && break
  sleep 3
done

echo "→ Εφαρμογή blueprint (provider + application)"
docker compose exec -T authentik-worker \
  ak apply_blueprint /blueprints/custom/trifylli-oidc.yaml >/dev/null 2>&1

# Οι λογαριασμοί του Trifylli, με τα email του seed. Το email είναι το κλειδί
# αντιστοίχισης: ο χρήστης του Authentik δένει με τον λογαριασμό της εφαρμογής
# μόνο αν ταιριάζει.
# Η αναζήτηση γίνεται με **email**, όχι με username: το email είναι το κλειδί
# που δένει τον χρήστη του Authentik με τον λογαριασμό του Trifylli. Έλεγχος με
# username άφηνε να δημιουργηθεί δεύτερος χρήστης με το ίδιο email, οπότε η
# σύνδεση γινόταν αμφίσημη και αποτύγχανε χωρίς εξηγήσιμο μήνυμα.
create_user() {
  local username=$1 email=$2 name=$3

  local existing existing_username
  read -r existing existing_username <<<"$(api GET "/core/users/?email=$email" | python3 -c \
    "import sys,json; r=json.load(sys.stdin).get('results',[]); print(f\"{r[0]['pk']} {r[0]['username']}\" if r else ' ')")"

  if [ -n "$existing" ]; then
    if [ "$existing_username" != "$username" ]; then
      echo "   ! το $email ανήκει ήδη στον χρήστη '$existing_username' — παραλείπεται" >&2
      return 0
    fi
    echo "   = $email (υπάρχει)"
  else
    existing=$(api POST /core/users/ -d "$(printf '{"username":"%s","name":"%s","email":"%s","is_active":true,"path":"users","type":"internal"}' \
      "$username" "$name" "$email")" | python3 -c "import sys,json; print(json.load(sys.stdin)['pk'])")
    echo "   + $email"
  fi

  api POST "/core/users/$existing/set_password/" \
    -d "$(printf '{"password":"%s"}' "$DEV_PASSWORD")" >/dev/null
}

echo "→ Εμφάνιση (brand)"
# Ο χρήστης δεν πρέπει να νιώσει ότι άλλαξε προϊόν στη μέση της σύνδεσης.
BRAND_PK=$(api GET '/core/brands/?default=true' | python3 -c \
  "import sys,json; print(json.load(sys.stdin)['results'][0]['brand_uuid'])")
api PATCH "/core/brands/$BRAND_PK/" -d '{
  "branding_title": "Trifylli",
  "branding_logo": "/media/public/logo.svg",
  "branding_favicon": "/media/public/favicon.svg",
  "attributes": {"settings": {"theme": {"base": "light"}}}
}' >/dev/null
echo "   = τίτλος, λογότυπο, favicon, ανοιχτό θέμα"

echo "→ Ροή σύνδεσης σε ένα βήμα"
# Το προεπιλεγμένο flow ζητά πρώτα όνομα και μετά κωδικό, σε δύο φορτώσεις
# σελίδας. Δένοντας το password stage πάνω στο identification, τα δύο πεδία
# εμφανίζονται μαζί και η σύνδεση τελειώνει με ένα submit.
IDENT_PK=$(api GET '/stages/identification/' | python3 -c \
  "import sys,json; r=[x for x in json.load(sys.stdin)['results'] if x['name']=='default-authentication-identification']; print(r[0]['pk'] if r else '')")
PASSWORD_PK=$(api GET '/stages/password/' | python3 -c \
  "import sys,json; r=[x for x in json.load(sys.stdin)['results'] if x['name']=='default-authentication-password']; print(r[0]['pk'] if r else '')")

if [ -n "$IDENT_PK" ] && [ -n "$PASSWORD_PK" ]; then
  api PATCH "/stages/identification/$IDENT_PK/" \
    -d "$(printf '{"password_stage":"%s","user_fields":["email","username"]}' "$PASSWORD_PK")" >/dev/null
  echo "   = όνομα και κωδικός σε μία οθόνη"
fi

# Το blueprint δηλώνει τη ροή μας κενή, αλλά το Authentik δεν αφαιρεί bindings
# που δεν δηλώνονται πια. Ένα στιγμιότυπο που είχε παλιότερα consent stage θα
# συνέχιζε να δείχνει την οθόνη «Continue», οπότε το καθαρίζουμε ρητά.
echo "→ Καμία ενδιάμεση οθόνη στην εξουσιοδότηση"
AUTH_FLOW_PK=$(api GET '/flows/instances/?slug=trifylli-authorization' | python3 -c \
  "import sys,json; r=json.load(sys.stdin).get('results',[]); print(r[0]['pk'] if r else '')")

if [ -n "$AUTH_FLOW_PK" ]; then
  api GET '/flows/bindings/?page_size=100' | python3 -c "
import sys, json
target = '$AUTH_FLOW_PK'
for b in json.load(sys.stdin).get('results', []):
    if b['target'] == target:
        print(b['pk'])" | while read -r binding; do
    [ -n "$binding" ] && api DELETE "/flows/bindings/$binding/" >/dev/null && echo "   - αφαιρέθηκε στάδιο συγκατάθεσης"
  done
fi
echo "   = η ροή είναι κενή· η επιστροφή στην εφαρμογή γίνεται χωρίς κλικ"

echo "→ Τίτλοι και φόντο ροών"
# Προσοχή: αυτά τα endpoints δέχονται **slug**, όχι uuid, και το
# `set_background_url` προσθέτει μόνο του το πρόθεμα `/media/public/`.
api PATCH '/flows/instances/default-authentication-flow/' \
  -d '{"title":"Σύνδεση στο Trifylli"}' >/dev/null
api PATCH '/flows/instances/default-invalidation-flow/' \
  -d '{"title":"Αποσύνδεση από το Trifylli"}' >/dev/null

for slug in default-authentication-flow trifylli-authorization \
            trifylli-invalidation default-invalidation-flow; do
  api POST "/flows/instances/$slug/set_background_url/" -d '{"url":"background.svg"}' >/dev/null
done
echo "   = ελληνικοί τίτλοι, φόντο στα χρώματα της εφαρμογής"

echo "→ Χρήστες ανάπτυξης (κωδικός: $DEV_PASSWORD)"
create_user 'trifylli-admin'  'admin@trifylli.local'    'Τοπικός Διαχειριστής'
create_user 'trifylli-asteria' 'seed-0000@trifylli.local' 'Διαχειριστής Αστεριών'
create_user 'trifylli-poulia'  'seed-0010@trifylli.local' 'Διαχειριστής Πουλιών'
create_user 'trifylli-odigoi'  'seed-0020@trifylli.local' 'Διαχειριστής Οδηγών'
create_user 'trifylli-mo'      'seed-0030@trifylli.local' 'Διαχειριστής Μεγάλων Οδηγών'

echo
echo "✓ Έτοιμο. Ρυθμίσεις για τα .env:"
curl -s "$AUTHENTIK_URL/application/o/trifylli/.well-known/openid-configuration" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"    OIDC_ISSUER={d['issuer']}\")
print(f\"    OIDC_JWKS_URI={d['jwks_uri']}\")
print('    OIDC_AUDIENCE=trifylli-pwa')
print(f\"    VITE_OIDC_AUTHORITY={d['issuer']}\")
print('    VITE_OIDC_CLIENT_ID=trifylli-pwa')
"
