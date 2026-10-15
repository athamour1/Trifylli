#!/bin/sh
# Φτιάχνει μια βάση στην Postgres της στοίβας αν δεν υπάρχει (idempotent).
# Για υπηρεσίες που προστίθενται ΜΕΤΑ το πρώτο στήσιμο — τα scripts του
# docker-entrypoint-initdb.d τρέχουν μόνο σε άδειο data directory.
#
#   ensure-db <βάση>        (PGHOST / PGUSER / PGPASSWORD από το περιβάλλον)
set -eu

db=${1:?χρήση: ensure-db <βάση>}
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
export PGHOST="${PGHOST:-postgres}"

case "$db" in
  *[!A-Za-z0-9_]*) echo "ensure-db: άκυρο όνομα βάσης «$db»" >&2; exit 2 ;;
esac

if [ "$(psql -d postgres -Atqc "select 1 from pg_database where datname = '$db'")" = "1" ]; then
  echo "ensure-db: η βάση $db υπάρχει."
else
  psql -d postgres -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$db\""
  echo "ensure-db: η βάση $db δημιουργήθηκε."
fi
