#!/bin/sh
# Αντίγραφα ΕΚΤΟΣ server, κρυπτογραφημένα (restic): τα dumps της Postgres και τα
# αρχεία του Garage (αποδείξεις ταμείου, εικόνες). Ένα backup στον ίδιο δίσκο με
# τη βάση σώζει από λάθος `DELETE`, όχι από χαμένο δίσκο ή κλεμμένο server.
#
#   offsite-backup          τρέχει για πάντα: πρώτη φορά μετά από OFFSITE_FIRST_DELAY,
#                           μετά κάθε OFFSITE_INTERVAL δευτερόλεπτα
#   offsite-backup once     μία φορά (χειροκίνητα ή για δοκιμή)
#   offsite-backup health   0 αν υπάρχει πρόσφατο επιτυχημένο αντίγραφο (healthcheck)
#
# Προορισμός: RESTIC_REPOSITORY (s3:…, b2:…, sftp:…, rest:…) + RESTIC_PASSWORD.
# Χωρίς προορισμό ΔΕΝ σταματά τη στοίβα· γράφει προειδοποίηση και το healthcheck
# αποτυγχάνει, ώστε να φαίνεται «unhealthy».
#
# Τα αρχεία του Garage έρχονται μέσω S3 (rclone, μεταβλητές RCLONE_S3_*) σε
# τοπικό καθρέφτη — όχι αντιγραφή των εσωτερικών αρχείων του, που δεν είναι
# συνεπής όσο τρέχει. Διατήρηση: το πολύ 30 ημέρες (ιατρικά δεδομένα — βλ.
# BACKUP_RETENTION_DAYS στο shared).
set -u

STATE=${OFFSITE_STATE_DIR:-/state}
MIRROR=${OFFSITE_MIRROR_DIR:-/mirror/garage}
SOURCES=${OFFSITE_SOURCES:-/backups /mirror}
MAX_AGE=${OFFSITE_MAX_AGE_HOURS:-30}
export RESTIC_CACHE_DIR="$STATE/cache"
export HOME="$STATE"

log() { echo "offsite-backup $(date -u +%Y-%m-%dT%H:%M:%SZ): $*"; }

configured() {
  if [ -z "${RESTIC_REPOSITORY:-}" ]; then
    log "ΠΡΟΣΟΧΗ: δεν έχει οριστεί RESTIC_REPOSITORY — κανένα αντίγραφο δεν φεύγει από τον server."
    return 1
  fi
  if [ -z "${RESTIC_PASSWORD:-}" ]; then
    log "ΠΡΟΣΟΧΗ: δεν έχει οριστεί RESTIC_PASSWORD — χωρίς αυτόν τα αντίγραφα δεν κρυπτογραφούνται."
    return 1
  fi
  return 0
}

# SFTP (Hetzner Storage Box, NAS): το ιδιωτικό κλειδί έρχεται σε base64, σε μία
# γραμμή — βολικό για .env και Portainer.
setup_ssh() {
  [ -n "${RESTIC_SSH_KEY_B64:-}" ] || return 0
  mkdir -p "$STATE/ssh"
  echo "$RESTIC_SSH_KEY_B64" | base64 -d > "$STATE/ssh/id"
  chmod 600 "$STATE/ssh/id"
}

restic_() {
  if [ -f "$STATE/ssh/id" ]; then
    restic -o "sftp.args=-i $STATE/ssh/id -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$STATE/ssh/known_hosts" "$@"
  else
    restic "$@"
  fi
}

run_once() {
  configured || return 1
  mkdir -p "$STATE" "$MIRROR"
  setup_ssh

  # Πρώτη φορά σε νέο προορισμό: αρχικοποίηση. Με λάθος κωδικό ΟΧΙ — το
  # αποθετήριο υπάρχει, απλώς δεν ανοίγει.
  if ! out=$(restic_ cat config 2>&1); then
    case "$out" in
      *"wrong password"*) log "ΣΦΑΛΜΑ: λάθος RESTIC_PASSWORD για το υπάρχον αποθετήριο."; return 1 ;;
    esac
    log "νέο αποθετήριο — αρχικοποίηση."
    restic_ init || { log "ΣΦΑΛΜΑ: δεν αρχικοποιήθηκε το αποθετήριο."; return 1; }
  fi

  log "καθρέφτης Garage (${S3_BUCKET:-trifylli})…"
  rclone sync --s3-no-check-bucket ":s3:${S3_BUCKET:-trifylli}" "$MIRROR" || { log "ΣΦΑΛΜΑ: ο καθρέφτης του Garage απέτυχε."; return 1; }

  log "αντίγραφο ($SOURCES)…"
  # shellcheck disable=SC2086
  restic_ backup --host trifylli --tag trifylli $SOURCES || { log "ΣΦΑΛΜΑ: το restic backup απέτυχε."; return 1; }

  log "διατήρηση ≤ 30 ημέρες…"
  restic_ forget --host trifylli --keep-within-daily 14d --keep-within-weekly 30d --prune || { log "ΣΦΑΛΜΑ: το forget/prune απέτυχε."; return 1; }
  restic_ check || { log "ΣΦΑΛΜΑ: ο έλεγχος του αποθετηρίου απέτυχε."; return 1; }

  date +%s > "$STATE/last-success"
  log "ολοκληρώθηκε."
}

health() {
  configured >/dev/null || return 1
  [ -f "$STATE/last-success" ] || return 1
  last=$(cat "$STATE/last-success")
  now=$(date +%s)
  [ $((now - last)) -lt $((MAX_AGE * 3600)) ]
}

case "${1:-loop}" in
  once) run_once ;;
  health) health ;;
  loop)
    sleep "${OFFSITE_FIRST_DELAY:-600}"
    while true; do
      run_once || log "η προσπάθεια απέτυχε — ξανά στον επόμενο κύκλο."
      sleep "${OFFSITE_INTERVAL:-86400}"
    done
    ;;
  *) echo "χρήση: offsite-backup [once|health]" >&2; exit 2 ;;
esac
