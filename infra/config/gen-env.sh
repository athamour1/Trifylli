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

# Κλειδιά VAPID (Web Push): ζεύγος P-256, σε base64url όπως τα θέλει το web-push —
# το ιδιωτικό είναι τα 32 bytes του κλειδιού, το δημόσιο το (ασυμπίεστο) σημείο.
b64url() { base64 | tr -d '\n=' | tr '+/' '-_'; }
vapid_dir=$(mktemp -d)
openssl ecparam -name prime256v1 -genkey -noout -out "$vapid_dir/key.pem" 2>/dev/null
VAPID_PRIVATE=$(openssl ec -in "$vapid_dir/key.pem" -outform DER 2>/dev/null | tail -c +8 | head -c 32 | b64url)
VAPID_PUBLIC=$(openssl ec -in "$vapid_dir/key.pem" -pubout -outform DER 2>/dev/null | tail -c 65 | b64url)
rm -rf "$vapid_dir"

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
    *'# vapid public'*) echo "${line%%=*}=$VAPID_PUBLIC" ;;
    *'# vapid private'*) echo "${line%%=*}=$VAPID_PRIVATE" ;;
    TAG=*)
      version=$(cat /config/VERSION 2>/dev/null || true)
      case "$version" in
        ''|dev) echo "$line" ;;
        *) echo "TAG=$version" ;;
      esac ;;
    OUCHTRACKER_PASSWORD=*|OUCHTRACKER_SEED_ADMIN_PASSWORD=*)
      # Ίδιος και στα δύο: το API του Trifylli μπαίνει με τον λογαριασμό που φτιάχνει το seed.
      echo "${line%%=*}=$OUCH_PASSWORD" ;;
    *)
      echo "$line" | sed "s/trifylli\.gr/$DOMAIN/g" ;;
  esac
done < /config/env.example
