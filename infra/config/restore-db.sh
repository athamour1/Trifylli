#!/bin/sh
# Επαναφορά ΜΙΑΣ βάσης από dump — βλ. docs/restore.md.
#
#   CONFIRM=<βάση> restore-db <βάση> <αρχείο>
#   CONFIRM=trifylli COLLAB_RESET=1 restore-db trifylli <αρχείο>
#
# Δέχεται το .sql.gz του `backup` (ημερήσιο) και το .dump του `predeploy-backup`.
# ΣΒΗΝΕΙ την τρέχουσα βάση και τη φτιάχνει από την αρχή· γι' αυτό θέλει ρητά
# CONFIRM με το όνομά της. Σταμάτα πρώτα ό,τι τη χρησιμοποιεί (api, authentik,
# ouchtracker) — οι συνδέσεις που μένουν κόβονται.
#
# COLLAB_RESET=1 (μόνο για τη βάση του Trifylli): τα κοινά έγγραφα της
# συνεργασίας ξαναγεμίζουν από τα πεδία του backup, με νέα γενιά. Όταν γυρνάς
# **πίσω** επίτηδες (π.χ. μετά από κακό migration), αλλιώς οι συσκευές που έχουν
# νεότερο αντίγραφο θα ξανάφερναν τις αλλαγές που θέλεις να φύγουν· με αυτό τα
# αντίγραφά τους πετιούνται (ό,τι δεν είχε σταλεί το βλέπουν για αντιγραφή).
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

if [ "${COLLAB_RESET:-}" = "1" ]; then
  # Χωρίς τα σωσμένα έγγραφα, κάθε έγγραφο γεμίζει ξανά από τα πεδία της βάσης την
  # επόμενη φορά που ανοίγει — με νέα γενιά, άρα τα παλιά αντίγραφα δεν ενώνονται.
  psql -d "$db" -v ON_ERROR_STOP=1 -q -c 'DELETE FROM collab_document'
  echo "restore-db: τα κοινά έγγραφα θα ξαναγεμίσουν από το backup (νέα γενιά)."
fi

echo "restore-db: $db επανήλθε από $(basename "$file")."
