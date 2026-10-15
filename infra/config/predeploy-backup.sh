#!/bin/sh
# Dump όλων των βάσεων ΠΡΙΝ από τα migrations. Ένα migration που σβήνει στήλες
# δεν αναιρείται· ένα dump ναι. Τρέχει σε κάθε `up`, πριν από το `migrate`.
#
#   DATABASES=trifylli,authentik,ouchtracker   οι βάσεις, χωρισμένες με κόμμα
#   PGHOST / PGUSER / PGPASSWORD               η σύνδεση (μεταβλητές του libpq)
#   PREDEPLOY_DIR (/backups/predeploy)         πού γράφονται
#   PREDEPLOY_KEEP_DAYS (30)                   πόσο κρατούνται — ίδιο όριο με τα
#                                              ημερήσια backups (ιατρικά δεδομένα)
#
# Επαναφορά: pg_restore --clean --if-exists -d <βάση> <αρχείο>.dump
set -eu

: "${DATABASES:?DATABASES is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
export PGHOST="${PGHOST:-postgres}"
DIR=${PREDEPLOY_DIR:-/backups/predeploy}
KEEP_DAYS=${PREDEPLOY_KEEP_DAYS:-30}

mkdir -p "$DIR"
stamp=$(date -u +%Y%m%d-%H%M%S)

for db in $(echo "$DATABASES" | tr ',' ' '); do
  # Στο πρώτο στήσιμο μια βάση μπορεί να μην υπάρχει ακόμα· δεν είναι λόγος να
  # σταματήσει το deploy.
  if [ "$(psql -d postgres -Atqc "select 1 from pg_database where datname = '$db'")" != "1" ]; then
    echo "predeploy-backup: η βάση $db δεν υπάρχει ακόμα — παραλείπεται."
    continue
  fi
  out="$DIR/$db-$stamp.dump"
  # Πρώτα σε .part: ένα μισό αρχείο δεν πρέπει ποτέ να μοιάζει με κανονικό dump.
  pg_dump -d "$db" -Fc -Z6 -f "$out.part"
  mv "$out.part" "$out"
  echo "predeploy-backup: $out ($(du -h "$out" | cut -f1))"
done

find "$DIR" -name '*.part' -delete
find "$DIR" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
