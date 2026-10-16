# Το «config» image της παραγωγικής στοίβας: όλα τα αρχεία ρυθμίσεων του `infra/`
# μέσα σε ένα image, ώστε η στοίβα να σηκώνεται μόνο από το docker-compose —
# χωρίς bind mounts σε αρχεία ενός repo που ο διαχειριστής δεν έχει.
#
#   config-sync   (default) γράφει τα αρχεία στα named volumes της στοίβας
#   garage-init   idempotent bootstrap του Garage (layout, bucket, key)
#   gen-env       τυπώνει έτοιμο .env.prod με τυχαία μυστικά
#   predeploy-backup  dump όλων των βάσεων πριν από τα migrations
#   offsite-backup    κρυπτογραφημένα αντίγραφα εκτός server (restic)
#   restore-db        επαναφορά μιας βάσης από dump (βλ. docs/restore.md)
#   ensure-db         φτιάχνει μια βάση αν λείπει (π.χ. του GlitchTip)
#   watchdog          δίσκος + υγεία υπηρεσιών → heartbeat κάθε 5' (docs/monitoring.md)
#
# Χτίζεται με context τη ρίζα του repo (χρειάζεται και το `.env.prod.example`):
#   docker build -f infra/config/Dockerfile -t ghcr.io/athamour1/trifylli/config .

FROM dxflrs/garage:v1.1.0 AS garage

FROM alpine:3.20
# pg_dump/psql ίδιας major έκδοσης με τον server (postgres:16)· restic + rclone
# (+ ssh για SFTP) για τα αντίγραφα εκτός server.
# openssl: τα κλειδιά VAPID του gen-env.
RUN apk add --no-cache postgresql16-client restic rclone openssh-client openssl
# Το στατικό binary του Garage — το garage-init δεν κατεβάζει πια τίποτα στο deploy.
COPY --from=garage /garage /usr/local/bin/garage

# Authentik: μόνο τα blueprints (*.yaml)· το setup.sh είναι εργαλείο ανάπτυξης.
COPY infra/authentik/*.yaml /config/authentik-blueprints/
COPY infra/authentik/branding /config/authentik-branding/
COPY infra/authentik/email-templates /config/authentik-templates/
COPY infra/postgres/init /config/postgres-init/
COPY infra/garage/garage.toml /config/garage/garage.toml
RUN ln -s /config/garage/garage.toml /etc/garage.toml
COPY infra/garage/bootstrap.sh /usr/local/bin/garage-init
COPY .env.prod.example /config/env.example
COPY infra/config/config-sync.sh /usr/local/bin/config-sync
COPY infra/config/gen-env.sh /usr/local/bin/gen-env
COPY infra/config/predeploy-backup.sh /usr/local/bin/predeploy-backup
COPY infra/config/offsite-backup.sh /usr/local/bin/offsite-backup
COPY infra/config/restore-db.sh /usr/local/bin/restore-db
COPY infra/config/ensure-db.sh /usr/local/bin/ensure-db
COPY infra/config/watchdog.sh /usr/local/bin/watchdog
# Το heartbeat: βιβλιοθήκη για offsite-backup/watchdog, και hook για το `backup`
# (μαζί με το 50-heartbeat, στο volume backup-hooks).
COPY infra/config/heartbeat.sh /usr/local/lib/heartbeat.sh
COPY infra/config/heartbeat.sh /config/backup-hooks/heartbeat.sh
COPY infra/backup-hooks/50-heartbeat /config/backup-hooks/50-heartbeat

RUN chmod +x /usr/local/bin/config-sync /usr/local/bin/garage-init /usr/local/bin/gen-env /usr/local/bin/predeploy-backup /usr/local/bin/offsite-backup /usr/local/bin/restore-db /usr/local/bin/ensure-db /usr/local/bin/watchdog \
 && chmod +x /config/backup-hooks/50-heartbeat \
 && chmod +x /config/postgres-init/*.sh

# Η έκδοση της στοίβας: το gen-env τη γράφει ως TAG στο .env.prod, ώστε μια νέα
# εγκατάσταση να μένει στην έκδοση που κατέβασε — όχι στο `latest`.
ARG VERSION=dev
RUN echo "$VERSION" > /config/VERSION

ENTRYPOINT []
CMD ["config-sync"]
