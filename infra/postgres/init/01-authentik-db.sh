#!/bin/sh
# Το Authentik χρειάζεται δική του βάση. Τρέχει μία φορά, στο πρώτο initdb του
# volume — αν το volume υπάρχει ήδη, δημιούργησε τη βάση χειροκίνητα:
#   docker compose exec postgres createdb -U trifylli authentik
set -e

AUTHENTIK_DB="${AUTHENTIK_DB:-authentik}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	SELECT 'CREATE DATABASE $AUTHENTIK_DB'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$AUTHENTIK_DB')\gexec
EOSQL
