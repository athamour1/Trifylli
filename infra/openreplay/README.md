# OpenReplay (session replay) — ρυθμίσεις

Αντίγραφα από το επίσημο `scripts/docker-compose` του OpenReplay **v1.28.0**
(github.com/openreplay/openreplay), με τις αλλαγές του Trifylli:

* `default.conf.template` — ο `nginx.conf` τους (αντικαθιστά το default.conf του image), με `listen ${REPLAY_LISTEN_PORT}`
  (8090 στο dev, 80 στην παραγωγή πίσω από τον reverse proxy).
* `minio.sh` — οι εγγραφές σβήνονται στις 30 ημέρες (εκείνοι: 180, σχολιασμένο).
* `init_pg_schema.sql`, `init_ch_schema.sql` — αυτούσια.

Τα services είναι στο `docker-compose.yml` / `docker-compose.prod.yml`
(profile `replay`). Αναβάθμιση: νέα αρχεία από το tag της νέας έκδοσης + τα
migrations του `scripts/schema/db/` (docs.openreplay.com/en/deployment/upgrade).
Βλ. docs/monitoring.md §5 και ROADMAP §6.
