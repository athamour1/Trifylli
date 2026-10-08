#!/bin/sh
# Τυπώνει ένα πλήρες .env.prod: το πρότυπο με ΤΥΧΑΙΑ μυστικά και τα domains σου.
#
#   docker run --rm -e DOMAIN=trifylli.gr ghcr.io/athamour1/trifylli/config gen-env > .env.prod
#
# Κάθε γραμμή `KEY=   # openssl rand -<hex|base64> N` παίρνει τιμή. Το DOMAIN
# αντικαθιστά το `trifylli.gr` στα URLs (app./api./sso./ouch.<DOMAIN>). Τα SMTP,
# το e-SEO και το email του υπερδιαχειριστή μένουν να τα συμπληρώσεις εσύ.
set -eu

rand_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
# base64 χωρίς χαρακτήρες που μπερδεύουν URLs/shells (+ / =).
rand_b64() { head -c "$(( $1 + 8 ))" /dev/urandom | base64 | tr -d '\n+/=' | cut -c1-"$(( $1 * 4 / 3 ))"; }

OUCH_PASSWORD=$(rand_b64 24)
DOMAIN=${DOMAIN:-trifylli.gr}

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    *'# GK + openssl rand -hex '*)
      # Κλειδί Garage: το πρόθεμα GK είναι υποχρεωτικό.
      key=${line%%=*}; n=$(echo "$line" | sed 's/.*openssl rand -hex \([0-9]*\).*/\1/')
      echo "$key=GK$(rand_hex "$n")" ;;
    *'# openssl rand -hex '*)
      key=${line%%=*}; n=$(echo "$line" | sed 's/.*openssl rand -hex \([0-9]*\).*/\1/')
      echo "$key=$(rand_hex "$n")" ;;
    *'# openssl rand -base64 '*)
      key=${line%%=*}; n=$(echo "$line" | sed 's/.*openssl rand -base64 \([0-9]*\).*/\1/')
      echo "$key=$(rand_b64 "$n")" ;;
    OUCHTRACKER_PASSWORD=*|OUCHTRACKER_SEED_ADMIN_PASSWORD=*)
      # Ίδιος και στα δύο: το API του Trifylli μπαίνει με τον λογαριασμό που φτιάχνει το seed.
      echo "${line%%=*}=$OUCH_PASSWORD" ;;
    *)
      echo "$line" | sed "s/trifylli\.gr/$DOMAIN/g" ;;
  esac
done < /config/env.example
