#!/bin/sh
# Οδηγός για νέο .env.prod: ρωτά ό,τι ξέρεις μόνο εσύ (domains, email, SMTP,
# Τοπικό, αντίγραφα) και τα υπόλοιπα τα βγάζει το gen-env — τυχαία μυστικά,
# κλειδιά VAPID, TAG. Γράφει στον φάκελο που του δίνεις:
#
#   docker run --rm -it -v "$PWD:/out" ghcr.io/athamour1/trifylli/config:<TAG> setup-env
#
# Δεν αντικαθιστά ποτέ υπάρχον αρχείο: με νέα μυστικά τα δεδομένα μιας στοίβας
# που ήδη τρέχει δεν ανοίγουν.
set -eu

OUT_DIR=/out
NAME=${1:-.env.prod}
TARGET="$OUT_DIR/$NAME"

say() { printf '%s\n' "$*" >&2; }

tmp=''
# Και με Ctrl-C: πίσω η ηχώ του τερματικού, κανένα μισό αρχείο με μυστικά.
cleanup() {
  if [ -t 0 ]; then stty echo 2>/dev/null || true; fi
  [ -z "$tmp" ] || rm -f "$tmp" "$tmp.new"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
die() { say "✗ $*"; exit 1; }

[ -d "$OUT_DIR" ] || die "Δεν βρίσκω το /out. Τρέξε: docker run --rm -it -v \"\$PWD:/out\" …config:<TAG> setup-env"
[ ! -e "$TARGET" ] || die "Υπάρχει ήδη το $NAME — δεν το αντικαθιστώ. Μετακίνησέ το αν θέλεις καινούριο."

# ── Ερωτήσεις ──
# ask ΜΕΤΑΒΛΗΤΗ "ερώτηση" [default]: κενή απάντηση = το default.
ask() {
  if [ -n "${3-}" ]; then printf '%s [%s]: ' "$2" "$3" >&2; else printf '%s: ' "$2" >&2; fi
  IFS= read -r _ans || _ans=''
  [ -n "$_ans" ] || _ans=${3-}
  case "$_ans" in
    *"'"*) say "  Χωρίς απόστροφο (') — το .env δεν τον κρατά σωστά."; ask "$@"; return ;;
  esac
  eval "$1=\$_ans"
}

# Χωρίς ηχώ στο τερματικό (μόνο με -t· με σωληνωμένη είσοδο διαβάζει κανονικά).
ask_secret() {
  if [ -t 0 ]; then stty -echo; fi
  ask "$@"
  if [ -t 0 ]; then stty echo; say ''; fi
}

ask_required() {
  while :; do
    ask "$@"
    eval "_v=\$$1"
    [ -n "$_v" ] && return
    say "  Χρειάζεται τιμή."
  done
}

# Μόνο λατινικοί χαρακτήρες: μια διεύθυνση με ελληνικά (π.χ. «Οδηγοίodigoi@…»,
# από κόλλημα του ονόματος) δεν τη δέχεται κανένας SMTP — και φαίνεται μόνο τη
# μέρα που δεν φτάνει ένα email.
ask_email() {
  while :; do
    ask "$@"
    eval "_v=\$$1"
    if [ -n "$(printf '%s' "$_v" | LC_ALL=C tr -d '\000-\177')" ]; then
      say "  Μόνο λατινικοί χαρακτήρες — π.χ. odigoi@example.gr (χωρίς ελληνικά στη διεύθυνση)."
      continue
    fi
    case "$_v" in
      ?*@?*.?*) case "$_v" in *[[:space:]\<\>\",\;]*) ;; *) return ;; esac ;;
    esac
    say "  Δεν μοιάζει με email."
  done
}

ask_host() {
  while :; do
    ask "$@"
    eval "_v=\$$1"
    _v=$(printf '%s' "$_v" | tr 'A-Z' 'a-z' | sed -e 's#^https\{0,1\}://##' -e 's#/*$##')
    case "$_v" in
      ''|*[!a-z0-9.-]*|.*|*.|*..*|-*) say "  Μόνο όνομα host, π.χ. app.example.gr." ;;
      *.*) eval "$1=\$_v"; return ;;
      *) say "  Μόνο όνομα host, π.χ. app.example.gr." ;;
    esac
  done
}

ask_yes() {
  while :; do
    ask _yn "$1 (ν/ο)" "$2"
    case "$_yn" in
      ν*|Ν*|y*|Y*) return 0 ;;
      ο*|Ο*|n*|N*) return 1 ;;
    esac
  done
}

# Τα δύο τελευταία labels: φτάνει για να πιάσει έναν υποτομέα σε άλλο domain.
base_of() { printf '%s' "$1" | awk -F. '{ print $(NF-1) "." $NF }'; }

say ''
say 'Νέο .env.prod για το Trifylli. Τα μυστικά βγαίνουν τυχαία· εδώ μόνο ό,τι ξέρεις εσύ.'
say 'Κενή απάντηση = η τιμή στις [αγκύλες].'

say ''
say '── Υποτομείς (ό,τι γράφει ο browser, πίσω από τον proxy σου με TLS) ──'
ask_host APP 'Εφαρμογή (PWA)'
case "$APP" in
  app.*) rest=${APP#app.}; d_api=api.$rest; d_sso=sso.$rest; d_ouch=ouch.$rest; d_err=errors.$rest
     d_replay=replay.$rest; d_analytics=analytics.$rest ;;
  *) first=${APP%%.*}; rest=${APP#*.}
     d_api=$first-api.$rest; d_sso=$first-sso.$rest; d_ouch=$first-ouch.$rest; d_err=$first-errors.$rest
     d_replay=$first-replay.$rest; d_analytics=$first-analytics.$rest ;;
esac
ask_host API 'API' "$d_api"
ask_host SSO 'Σύνδεση (Authentik)' "$d_sso"
ask_host OUCH 'OuchTracker (φαρμακεία)' "$d_ouch"
GLITCHTIP=no
if ask_yes 'GlitchTip για τα σφάλματα;' 'ν'; then
  GLITCHTIP=yes
  ask_host ERRORS 'GlitchTip' "$d_err"
else
  ERRORS=$d_err
fi
REPLAY=no
if ask_yes 'Καταγραφή συνεδριών (OpenReplay, ~20 containers, ≥ 8 GB RAM);' 'ο'; then
  REPLAY=yes
  ask_host REPLAY_HOST 'OpenReplay' "$d_replay"
else
  REPLAY_HOST=$d_replay
fi
ANALYTICS=no
if ask_yes 'Ανώνυμα analytics (Umami);' 'ν'; then
  ANALYTICS=yes
  ask_host ANALYTICS_HOST 'Umami' "$d_analytics"
else
  ANALYTICS_HOST=$d_analytics
fi

# Η σιωπηλή ανανέωση και το Single Logout θέλουν το ίδιο registrable domain.
base=$(base_of "$SSO")
for h in "$APP" "$API" "$OUCH"; do
  if [ "$(base_of "$h")" != "$base" ]; then
    say "  ⚠ Το $h δεν είναι κάτω από το $base, όπως το Authentik:"
    say '    η σύνδεση θα λήγει και το logout δεν θα φτάνει στις άλλες εφαρμογές.'
    ask_yes '  Να συνεχίσω έτσι;' 'ο' || die 'Σταμάτησα· ξανατρέξε με υποτομείς του ίδιου domain.'
  fi
done

say ''
say '── Διαχειριστές ──'
ask_email ADMIN_EMAIL 'Email του υπερδιαχειριστή (ο πρώτος που μπαίνει με αυτό παίρνει όλα τα δικαιώματα)'
while :; do
  ask_email AK_EMAIL 'Email του λογαριασμού akadmin στο Authentik (άλλο από το παραπάνω)' "akadmin@${SSO#*.}"
  [ "$AK_EMAIL" != "$ADMIN_EMAIL" ] && break
  say '  Πρέπει να διαφέρει — αλλιώς η σύνδεση με email γίνεται αμφίσημη.'
done
ask OUCH_ADMINS 'Admins στο OuchTracker (emails, με κόμμα)' "$ADMIN_EMAIL"

say ''
say '── Το Τοπικό (φτιάχνεται στο πρώτο σήκωμα, σε άδεια βάση) ──'
ask_required TOPIKO_NAME 'Όνομα' 'Τοπικό Τμήμα'
ask TOPIKO_LOCATION 'Τοποθεσία (προαιρετικό)'
ask TOPIKO_ESEO_CODE 'Κωδικός μονάδας στο e-SEO (προαιρετικό)'
while :; do
  ask SYNDROMI 'Ετήσια συνδρομή (€)' '60'
  case "$SYNDROMI" in ''|*[!0-9]*) say '  Μόνο ακέραιος.' ;; *) break ;; esac
done

say ''
say '── Email (προσκλήσεις, ανάκτηση κωδικού) — υποχρεωτικό ──'
ask_required SMTP_HOST 'SMTP host' 'smtp.eu.mailgun.org'
say '  Πολλοί πάροχοι servers (π.χ. Hetzner) κόβουν τις εξερχόμενες θύρες 25 και 465 — προτίμησε 587.'
while :; do
  ask SMTP_PORT 'SMTP θύρα (587 = STARTTLS, 465 = TLS)' '587'
  case "$SMTP_PORT" in ''|*[!0-9]*) say '  Μόνο αριθμός.' ;; *) break ;; esac
done
case "$SMTP_PORT" in
  465) say '  Προσοχή: αν ο server κόβει την 465, τα email δεν θα φεύγουν (timeout) — τότε βάλε 587.' ;;
  25) say '  Προσοχή: η 25 είναι για επικοινωνία servers και κόβεται σχεδόν παντού — βάλε 587.' ;;
esac
ask SMTP_USERNAME 'SMTP χρήστης'
ask_secret SMTP_PASSWORD 'SMTP κωδικός'
ask_email FROM_EMAIL 'Διεύθυνση αποστολέα (σε domain με SPF/DKIM στον πάροχο)'
ask FROM_NAME 'Όνομα αποστολέα' 'Trifylli'

say ''
say '── e-SEO ──'
ask_secret ESEO_TOKEN 'Refresh token του e-SEO (κενό = χωρίς συγχρονισμό μελών προς το παρόν)'

say ''
say '── Αντίγραφα εκτός server (restic) ──'
say '  π.χ. sftp://u123456@u123456.your-storagebox.de:23/trifylli'
say '       s3:https://s3.eu-central-003.backblazeb2.com/<bucket>/trifylli'
ask RESTIC_REPO 'Αποθετήριο (κενό = αργότερα· ως τότε το backup-offsite μένει «unhealthy»)'
RESTIC_KEY_ID=''; RESTIC_SECRET=''; RESTIC_SSH=''
case "$RESTIC_REPO" in
  s3:*)
    ask_required RESTIC_KEY_ID 'Access key ID'
    ask_secret RESTIC_SECRET 'Secret access key' ;;
  sftp:*)
    while :; do
      ask KEY_FILE 'Ιδιωτικό κλειδί SSH, μέσα σε αυτόν τον φάκελο (π.χ. id_ed25519· κενό = αργότερα)'
      [ -n "$KEY_FILE" ] || break
      if [ -f "$OUT_DIR/$KEY_FILE" ]; then
        RESTIC_SSH=$(base64 < "$OUT_DIR/$KEY_FILE" | tr -d '\n'); break
      fi
      say "  Δεν βρίσκω το $KEY_FILE στον τρέχοντα φάκελο."
    done ;;
esac

# ── Το αρχείο: το πρότυπο του gen-env, με τις απαντήσεις ──
tmp=$(mktemp)
gen-env > "$tmp"

# set_var ΚΛΕΙΔΙ τιμή: αντικαθιστά τη γραμμή (ή την προσθέτει). Η τιμή περνά από
# το περιβάλλον, όχι μέσα από regex — ό,τι χαρακτήρες κι αν έχει. Σε μονά
# εισαγωγικά όταν έχει κάτι που το compose θα ερμήνευε ($, #, κενά).
set_var() {
  case "$2" in
    *[!A-Za-z0-9@._:/,+=-]*) _q="'$2'" ;;
    *) _q=$2 ;;
  esac
  V=$_q awk -v k="$1" '
    BEGIN { v = ENVIRON["V"] }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$tmp" > "$tmp.new"
  mv "$tmp.new" "$tmp"
}

if ! grep -q '^TAG=.' "$tmp"; then
  ask_required TAG_IN 'Έκδοση (TAG, π.χ. v1.1.0)'
  set_var TAG "$TAG_IN"
fi

set_var CORS_ORIGINS "https://$APP"
set_var OIDC_ISSUER "https://$SSO/application/o/trifylli/"
set_var OIDC_JWKS_URI "https://$SSO/application/o/trifylli/jwks/"
set_var VITE_API_URL "https://$API/api"
set_var VITE_OIDC_AUTHORITY "https://$SSO/application/o/trifylli/"
set_var VITE_OUCHTRACKER_URL "https://$OUCH"
set_var TRIFYLLI_APP_URL "https://$APP/"
set_var OUCHTRACKER_APP_URL "https://$OUCH/"
set_var OUCHTRACKER_CORS_ORIGIN "https://$OUCH"
set_var OUCHTRACKER_OIDC_ISSUER "https://$SSO/application/o/ouchtracker/"
set_var GLITCHTIP_DOMAIN "https://$ERRORS"
set_var GLITCHTIP_OIDC_ISSUER "https://$SSO/application/o/glitchtip/"
set_var REPLAY_URL "https://$REPLAY_HOST"
set_var UMAMI_URL "https://$ANALYTICS_HOST"
profiles=""
[ "$GLITCHTIP" = yes ] && profiles="errors"
[ "$REPLAY" = yes ] && profiles="${profiles:+$profiles,}replay"
[ "$ANALYTICS" = yes ] && profiles="${profiles:+$profiles,}analytics"
[ -n "$profiles" ] && set_var COMPOSE_PROFILES "$profiles"

set_var SUPER_ADMIN_EMAIL "$ADMIN_EMAIL"
set_var AUTHENTIK_BOOTSTRAP_EMAIL "$AK_EMAIL"
set_var OUCHTRACKER_OIDC_ADMIN_EMAILS "$OUCH_ADMINS"
set_var VAPID_SUBJECT "mailto:$ADMIN_EMAIL"

set_var TOPIKO_NAME "$TOPIKO_NAME"
set_var TOPIKO_LOCATION "$TOPIKO_LOCATION"
set_var TOPIKO_ESEO_CODE "$TOPIKO_ESEO_CODE"
set_var SYNDROMI_AMOUNT "$SYNDROMI"

set_var SMTP_HOST "$SMTP_HOST"
set_var SMTP_PORT "$SMTP_PORT"
set_var SMTP_USERNAME "$SMTP_USERNAME"
set_var SMTP_PASSWORD "$SMTP_PASSWORD"
if [ "$SMTP_PORT" = 465 ]; then
  set_var SMTP_USE_TLS false; set_var SMTP_USE_SSL true
else
  set_var SMTP_USE_TLS true; set_var SMTP_USE_SSL false
fi
set_var SMTP_FROM "$FROM_NAME <$FROM_EMAIL>"

set_var ESEO_REFRESH_TOKEN "$ESEO_TOKEN"

set_var RESTIC_REPOSITORY "$RESTIC_REPO"
set_var RESTIC_AWS_ACCESS_KEY_ID "$RESTIC_KEY_ID"
set_var RESTIC_AWS_SECRET_ACCESS_KEY "$RESTIC_SECRET"
set_var RESTIC_SSH_KEY_B64 "$RESTIC_SSH"

# Φρένο: μια μεταβλητή του προτύπου με URL που δεν ρωτήθηκε θα έμενε στο example.
if grep -v '^[[:space:]]*#' "$tmp" | grep -q 'trifylli\.gr'; then
  grep -v '^[[:space:]]*#' "$tmp" | grep 'trifylli\.gr' | cut -d= -f1 | sed 's/^/  /' >&2
  die 'Αυτές οι μεταβλητές έχουν ακόμα το example domain — δεν έγραψα τίποτα.'
fi

cp "$tmp" "$TARGET"
chmod 600 "$TARGET"
# Του χρήστη που έχει τον φάκελο, όχι του root του container.
chown "$(stat -c %u:%g "$OUT_DIR")" "$TARGET"

say ''
say "✓ Γράφτηκε το $NAME (μόνο για τον κάτοχο). Βάλ' το ΑΜΕΣΩΣ σε password manager:"
say '  χωρίς αυτό ούτε τα αντίγραφα ανοίγουν ούτε το Authentik επανέρχεται.'
say ''
say 'Στον proxy (Docker: docker network connect trifylli-public <container του proxy>):'
say "  $APP → trifylli-web:80"
say "  $API → trifylli-api:3000   (με WebSocket)"
say "  $SSO → trifylli-sso:9000"
say "  $OUCH → trifylli-ouch:80"
[ "$GLITCHTIP" = yes ] && say "  $ERRORS → trifylli-errors:8000"
[ "$REPLAY" = yes ] && say "  $REPLAY_HOST → trifylli-replay:80"
[ "$ANALYTICS" = yes ] && say "  $ANALYTICS_HOST → trifylli-analytics:3000"
say ''
say 'Έμειναν για μετά (στο αρχείο, κενά):'
[ -n "$ESEO_TOKEN" ] || say '  • ESEO_REFRESH_TOKEN — ο συγχρονισμός μελών με το e-SEO'
[ -n "$RESTIC_REPO" ] || say '  • RESTIC_REPOSITORY (+ κλειδιά) — αντίγραφα εκτός server'
[ "$GLITCHTIP" = yes ] && say '  • API_SENTRY_DSN / WEB_SENTRY_DSN — μετά το createsuperuser και τα δύο projects στο GlitchTip'
[ "$REPLAY" = yes ] && say '  • OPENREPLAY_PROJECT_KEY — μετά τον πρώτο λογαριασμό στο OpenReplay (docs/monitoring.md §5)'
[ "$ANALYTICS" = yes ] && say '  • UMAMI_WEBSITE_ID — μετά το «Add website» στο Umami (άλλαξε και τον κωδικό admin / umami)'
say '  • HEARTBEAT_* — docs/monitoring.md'
