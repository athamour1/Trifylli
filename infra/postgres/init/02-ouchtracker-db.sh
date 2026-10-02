#!/bin/sh
# Το OuchTracker (φαρμακεία) μοιράζεται τον ίδιο Postgres με το Trifylli, σε
# δική του βάση. Τρέχει μία φορά στο πρώτο initdb του volume — αν το volume
# υπάρχει ήδη, δημιούργησε τη βάση χειροκίνητα:
#   docker compose exec postgres createdb -U trifylli ouchtracker
set -e

OUCHTRACKER_DB="${OUCHTRACKER_DB:-ouchtracker}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	SELECT 'CREATE DATABASE $OUCHTRACKER_DB'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$OUCHTRACKER_DB')\gexec
EOSQL
