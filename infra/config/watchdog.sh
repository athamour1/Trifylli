#!/bin/sh
# Κάθε WATCHDOG_INTERVAL δευτερόλεπτα (300): δίσκος και υγεία των υπηρεσιών →
# heartbeat. Το ίδιο το heartbeat είναι και ο «νεκρός διακόπτης»: αν πέσει ο
# server, το ρεύμα ή το internet του σπιτιού, σταματούν τα pings και η εξωτερική
# υπηρεσία (Healthchecks / Uptime Kuma) ειδοποιεί μόνη της.
#
#   watchdog          για πάντα
#   watchdog once     ένας έλεγχος (για δοκιμή): τυπώνει τι βρήκε
#
# Στα logs γράφει μόνο όταν αλλάζει η κατάσταση — όχι μία γραμμή ανά 5 λεπτά.
set -u
. /usr/local/lib/heartbeat.sh

INTERVAL=${WATCHDOG_INTERVAL:-300}
DISK_MAX=${DISK_ALERT_PERCENT:-85}
STATE=${WATCHDOG_STATE_DIR:-/state}
API_HEALTH=${WATCHDOG_API_URL:-http://api:3000/api/health/ready}

# Τα προβλήματα, χωρισμένα με «;» — κενό αν όλα είναι εντάξει.
problems() {
  p=''
  # Ο δίσκος των volumes: το /state είναι named volume, στον ίδιο δίσκο με τα άλλα.
  used=$(df -P "$STATE" | awk 'NR==2 { sub("%", "", $5); print $5 }')
  [ "${used:-0}" -lt "$DISK_MAX" ] || p="$p δίσκος ${used}%;"
  pg_isready -q -h postgres -t 5 || p="$p postgres;"
  nc -z -w 5 redis 6379 || p="$p redis;"
  nc -z -w 5 garage 3900 || p="$p garage;"
  wget -q -T 10 -O /dev/null "$API_HEALTH" || p="$p api;"
  wget -q -T 10 -O /dev/null http://web/ || p="$p web;"
  wget -q -T 10 -O /dev/null http://authentik-server:9000/-/health/live/ || p="$p authentik;"
  printf '%s' "${p# }"
}

check_once() {
  now=$(problems)
  if [ -z "$now" ]; then
    heartbeat "${HEARTBEAT_URL:-}" ok "ok"
  else
    heartbeat "${HEARTBEAT_URL:-}" fail "$now"
  fi
  printf '%s' "$now"
}

case "${1:-loop}" in
  once)
    now=$(check_once)
    if [ -z "$now" ]; then echo "watchdog: όλα εντάξει."; else echo "watchdog: ΠΡΟΒΛΗΜΑ — $now"; exit 1; fi
    ;;
  loop)
    last=''
    while true; do
      now=$(check_once)
      if [ "$now" != "$last" ]; then
        if [ -z "$now" ]; then
          echo "watchdog $(date -u +%Y-%m-%dT%H:%M:%SZ): όλα εντάξει."
        else
          echo "watchdog $(date -u +%Y-%m-%dT%H:%M:%SZ): ΠΡΟΒΛΗΜΑ — $now"
        fi
      fi
      last=$now
      sleep "$INTERVAL"
    done
    ;;
  *) echo "χρήση: watchdog [once]" >&2; exit 2 ;;
esac
