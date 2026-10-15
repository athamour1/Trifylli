# Επαναφορά

> **Δοκιμάστηκε 2026-10-15** στο dev, από την αρχή ως το τέλος: αντίγραφο restic →
> άδεια Postgres 16 → `restore-db` και με τις δύο μορφές dump → ίδια πλήθη
> εγγραφών με την πηγή, `prisma migrate status` «up to date»· αρχεία του Garage
> από τον καθρέφτη σε άλλο bucket → 8/8 ίδια (`rclone check`).
> Επανάλαβε τη δοκιμή κάθε λίγους μήνες και μετά από κάθε αλλαγή στα backups
> (βλ. «Δοκιμή επαναφοράς» στο τέλος).

## Τι υπάρχει και πού

| Τι | Πού | Πόσο κρατά |
| :--- | :--- | :--- |
| Ημερήσιο dump όλων των βάσεων (`.sql.gz`) | volume `postgres-backups` — service `backup` | 14 ημέρες + 4 εβδομαδιαία |
| Dump πριν από κάθε migration (`.dump`) | volume `postgres-predeploy` — service `predeploy-backup` | 30 ημέρες |
| Όλα τα παραπάνω **και** τα αρχεία του Garage, κρυπτογραφημένα | αποθετήριο restic **εκτός server** — service `backup-offsite` | ≤ 30 ημέρες |
| Τα μυστικά | το `.env.prod` — **σε password manager**, εκτός server | — |

**Χωρίς το `.env.prod` δεν γίνεται επαναφορά.** Το `AUTHENTIK_SECRET_KEY`
κρυπτογραφεί δεδομένα του Authentik, το `RESTIC_PASSWORD` ανοίγει τα αντίγραφα
εκτός server, τα `S3_*` είναι τα κλειδιά του Garage.

Οι βάσεις: `trifylli` (το API), `authentik` (λογαριασμοί, κωδικοί, ροές SSO),
`ouchtracker` (φαρμακεία). Επανέφερε **όλες από την ίδια στιγμή** — ένας χρήστης
στο Trifylli χωρίς τον λογαριασμό του στο Authentik δεν μπαίνει.

Σε όλες τις εντολές:

```bash
dc() { docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"; }
```

Το `restore-db` **σβήνει** τη βάση που επαναφέρει και θέλει ρητά
`CONFIRM=<βάση>` — χωρίς αυτό αρνείται.

---

## Α. Κακό deploy (rollback)

Ένα migration χάλασε ή η νέα έκδοση δεν δουλεύει.

```bash
# 1. Το dump που κράτησε ο predeploy-backup ΠΡΙΝ από το migration (το πιο πρόσφατο).
dc run --rm --entrypoint ls predeploy-backup -lt /backups/predeploy

# 2. Σταμάτα ό,τι γράφει στις βάσεις.
dc stop api web authentik-server authentik-worker ouchtracker-backend

# 3. Γύρνα το TAG στο .env.prod στην προηγούμενη έκδοση (π.χ. v1.0.2).

# 4. Επαναφορά — για κάθε βάση, από την ίδια ώρα:
dc run --rm -e CONFIRM=trifylli --entrypoint restore-db predeploy-backup \
  trifylli /backups/predeploy/trifylli-<ώρα>.dump
#    (το ίδιο για authentik και ouchtracker, αν τις άγγιξε η νέα έκδοση)

# 5. Πάνω, με την παλιά έκδοση.
dc pull && dc up -d
```

Το `up` τρέχει ξανά τον `predeploy-backup` (κρατά dump της επαναφερμένης
βάσης) και το `migrate` — με το παλιό TAG δεν βρίσκει νέα migrations.

---

## Β. Μία βάση, από τα τοπικά αντίγραφα

Λάθος διαγραφή, χαλασμένα δεδομένα — ο δίσκος είναι εντάξει.

```bash
# Τα ημερήσια (daily/), εβδομαδιαία (weekly/) και τα τελευταία (last/):
dc run --rm --entrypoint ls predeploy-backup -lt /backups/pg/daily

dc stop api                     # ή authentik-server authentik-worker / ouchtracker-backend
dc run --rm -e CONFIRM=trifylli --entrypoint restore-db predeploy-backup \
  trifylli /backups/pg/daily/trifylli-<ημερομηνία>.sql.gz
dc up -d
```

---

## Γ. Καταστροφή: νέος server

Ο δίσκος χάθηκε, ή ο server. Θέλεις το `docker-compose.prod.yml` και το `.env.prod`
από το password manager — **ίδιο TAG** με αυτό που έτρεχε.

```bash
# 1. Μόνο η βάση και το Garage (ο `config` και το `garage-init` τρέχουν μόνοι τους).
dc pull
dc up -d postgres garage garage-init

# 2. Τα αντίγραφα από το restic σε ένα volume.
dc run --rm -v trifylli-restore:/restore backup-offsite \
  offsite-backup restore /restore
#    Μέσα: /restore/backups/pg/{daily,weekly,last}/*.sql.gz,
#          /restore/backups/predeploy/*.dump, /restore/mirror/garage/…

# 3. Οι τρεις βάσεις, από την ίδια μέρα (ή το νεότερο predeploy, αν είναι πιο πρόσφατο).
for db in trifylli authentik ouchtracker; do
  dc run --rm -v trifylli-restore:/restore:ro -e CONFIRM=$db --entrypoint restore-db \
    predeploy-backup $db /restore/backups/pg/daily/$db-<ημερομηνία>.sql.gz
done

# 4. Τα αρχεία του Garage (αποδείξεις, εικόνες) πίσω στο bucket.
dc run --rm -v trifylli-restore:/restore:ro backup-offsite \
  rclone copy /restore/mirror/garage ":s3:trifylli"

# 5. Όλα τα υπόλοιπα.
dc up -d
```

**Έλεγχος:** σύνδεση, μια δράση με εικόνα σε προγραμματικό, μια απόδειξη στο
ταμείο, και `dc ps` — όλα `healthy`. Μετά σβήσε το `trifylli-restore`
(`docker volume rm trifylli-restore`): έχει δεδομένα παιδιών σε καθαρό κείμενο.

---

## Δοκιμή επαναφοράς

Ένα αντίγραφο που δεν έχει επαναφερθεί είναι ελπίδα, όχι αντίγραφο. Κάθε λίγους
μήνες, σε **ξεχωριστό** δίκτυο — όχι πάνω στο prod:

1. `offsite-backup restore` σε ένα δοκιμαστικό volume (όπως στο Γ.2).
2. Μια άδεια Postgres: `docker run -d --name restore-pg --network restore-net -e POSTGRES_USER=trifylli -e POSTGRES_PASSWORD=… postgres:16-alpine`.
3. `restore-db` με `PGHOST=restore-pg` για κάθε βάση.
4. Πλήθη εγγραφών σε `user`, `drasi`, `drasi_participant`, `treasury_entry` —
   ίδια με το prod εκείνης της μέρας.
5. `prisma migrate status` από το image του API με `DATABASE_URL` προς το `restore-pg`
   → «Database schema is up to date!».
6. `rclone check /restore/mirror/garage ":s3:trifylli"` → «0 differences».
7. Σβήσε το δοκιμαστικό container, δίκτυο και volume.
