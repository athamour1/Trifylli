#!/bin/sh
# Γράφει τα αρχεία ρυθμίσεων στα named volumes της στοίβας, κάτω από το /sync.
#
# Για κάθε κατάλογο του /config που έχει αντίστοιχο mount στο /sync/<όνομα>:
# ΣΒΗΝΕΙ ό,τι υπάρχει και αντιγράφει από την αρχή. Όχι `cp` πάνω από τα παλιά:
# ένα blueprint που αφαιρέθηκε από το image θα συνέχιζε αλλιώς να εφαρμόζεται.
# Τρέχει σε κάθε `up` — ένα νέο image φέρνει νέα configs χωρίς άλλο βήμα.
set -eu

synced=0
for src in /config/*/; do
  name=$(basename "$src")
  dst="/sync/$name"
  [ -d "$dst" ] || continue
  find "$dst" -mindepth 1 -delete
  cp -R "$src". "$dst"/
  # Αναγνώσιμα από όλους: διαβάζονται από containers με άλλον χρήστη.
  chmod -R a+rX "$dst"
  echo "[config-sync] $name: $(find "$dst" -type f | wc -l) αρχεία"
  synced=$((synced + 1))
done

[ "$synced" -gt 0 ] || { echo "[config-sync] κανένα volume στο /sync — τίποτα να γραφτεί" >&2; exit 1; }
echo "[config-sync] έτοιμο."
