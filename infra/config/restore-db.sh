#!/bin/sh
# Επαναφορά ΜΙΑΣ βάσης από dump — βλ. docs/restore.md.
#
#   CONFIRM=<βάση> restore-db <βάση> <αρχείο>
#
# Δέχεται το .sql.gz του `backup` (ημερήσιο) και το .dump του `predeploy-backup`.
# ΣΒΗΝΕΙ την τρέχουσα βάση και τη φτιάχνει από την αρχή· γι' αυτό θέλει ρητά
# CONFIRM με το όνομά της. Σταμάτα πρώτα ό,τι τη χρησιμοποιεί (api, authentik,
# ouchtracker) — οι συνδέσεις που μένουν κόβονται.
set -eu
set -o pipefail

db=${1:?χρήση: CONFIRM=<βάση> restore-db <βάση> <αρχείο>}
file=${2:?χρήση: CONFIRM=<βάση> restore-db <βάση> <αρχείο>}
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
export PGHOST="${PGHOST:-postgres}"

[ -f "$file" ] || { echo "restore-db: δεν υπάρχει το $file" >&2; exit 1; }
if [ "${CONFIRM:-}" != "$db" ]; then
  echo "restore-db: θα ΣΒΗΣΤΕΙ η βάση «$db». Για να προχωρήσεις: CONFIRM=$db" >&2
  exit 2
fi

echo "restore-db: η βάση $db ξαναφτιάχνεται…"
psql -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$db\""

case "$file" in
  *.sql.gz) gunzip -c "$file" | psql -d "$db" -v ON_ERROR_STOP=1 -q >/dev/null ;;
  *.dump) pg_restore -d "$db" --no-owner --exit-on-error "$file" ;;
  *) echo "restore-db: άγνωστη μορφή — περιμένω .sql.gz ή .dump" >&2; exit 1 ;;
esac

echo "restore-db: $db επανήλθε από $(basename "$file")."
