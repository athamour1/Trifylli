# Heartbeat προς Healthchecks ή Uptime Kuma — ίδια αντιστοίχιση με το
# `apps/api/src/common/jobs/job-monitor.ts`. Βιβλιοθήκη: `. heartbeat.sh`.
#
#   heartbeat <url> <ok|fail> [μήνυμα]
#
#   Healthchecks (healthchecks.io ή self-hosted): ok → το URL, fail → <url>/fail,
#   το μήνυμα στο body.
#   Uptime Kuma (push monitor — /api/push/<token>): ?status=up|down&msg=…
#
# Δεν αποτυγχάνει ποτέ: ένα heartbeat που δεν φεύγει δεν πρέπει να ρίξει ένα
# backup (το `run-parts` του backup σταματά στο πρώτο hook που αποτυγχάνει).
heartbeat() {
  hb_url=${1:-}
  hb_state=${2:-ok}
  hb_msg=${3:-}
  [ -n "$hb_url" ] || return 0

  case "$hb_url" in
    */api/push/*)
      case "$hb_url" in *\?*) hb_sep='&' ;; *) hb_sep='?' ;; esac
      if [ "$hb_state" = ok ]; then hb_status=up; else hb_status=down; fi
      # Percent-encoding κάθε byte: σωστό και για ελληνικά (UTF-8).
      hb_enc=$(printf '%s' "${hb_msg:-$hb_state}" | head -c 200 | od -An -tx1 | tr -d ' \n' | sed 's/../%&/g')
      hb_target="${hb_url}${hb_sep}status=${hb_status}&msg=${hb_enc}"
      ;;
    *)
      if [ "$hb_state" = ok ]; then hb_target=$hb_url; else hb_target="${hb_url%/}/fail"; fi
      ;;
  esac

  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 10 --retry 2 -o /dev/null --data-raw "$hb_msg" "$hb_target" >/dev/null 2>&1 \
      || echo "heartbeat: δεν έφυγε ($hb_state)" >&2
  else
    wget -q -T 10 -O /dev/null --post-data="$hb_msg" "$hb_target" >/dev/null 2>&1 \
      || echo "heartbeat: δεν έφυγε ($hb_state)" >&2
  fi
  return 0
}
