# Αναβάθμιση

Κάθε έκδοση είναι ένα νέο `TAG` και `pull` + `up -d`. Ο `predeploy-backup` κρατά
dump όλων των βάσεων **πριν** από τα migrations, άρα κάθε αναβάθμιση έχει δρόμο
επιστροφής ([`restore.md`](restore.md), Α). Όταν αλλάζει και το compose — όπως από
τη v1.0.2 — αντικαθιστάς και το `docker-compose.prod.yml` πριν από το `up`.

```bash
dc() { docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"; }
```

## Κάθε φορά

1. Κράτα αντίγραφο του `docker-compose.prod.yml` και του `.env.prod` που τρέχουν —
   ένα rollback θέλει και τα δύο.
2. Πάρε το `docker-compose.prod.yml` από το tag της νέας έκδοσης και άλλαξε το
   `TAG` στο `.env.prod`.
3. Σήκωμα:

   ```bash
   dc pull
   dc up -d
   ```

4. Έλεγχος:

   ```bash
   dc ps -a                    # config, garage-init, predeploy-backup, migrate: «Exited (0)»· οι άλλες «Up»
   dc logs predeploy-backup    # ένα dump ανά βάση
   dc logs migrate | tail -5   # ποια migrations πέρασαν (ή «No pending migrations»)
   curl -fsS https://api.example.gr/api/health/ready
   ```

   Μετά σύνδεση και μία σελίδα με δεδομένα.

Αν κάτι δεν πάει καλά: [`restore.md`](restore.md), Α — και αν η νέα έκδοση άλλαξε
το compose, μαζί με το `TAG` γυρνά και το compose.

---

## Από v1.1.2

Η ρουτίνα του «Κάθε φορά», **με** το νέο `docker-compose.prod.yml`.

**Τι αλλάζει:**

* GlitchTip: DuckDB ανοιχτό (spans και logs), MCP ανοιχτό
  (`GLITCHTIP_ENABLE_MCP`), και «Log in with Authentik» (νέο blueprint
  `glitchtip-oidc.yaml` + one-shot `glitchtip-sso`). Στο `.env.prod`:
  `GLITCHTIP_OIDC_ISSUER=https://sso.<domain>/application/o/glitchtip/` και
  `GLITCHTIP_OIDC_CLIENT_SECRET` (`openssl rand -hex 32`)· χωρίς αυτά το SSO
  απλώς δεν εμφανίζεται.
* API και PWA: τα «extras» του error tracking (tracing, logs, breadcrumbs,
  «Αναφορά προβλήματος») ανοιχτά από προεπιλογή — `SENTRY_EXTRAS=true`, ως την
  έξοδο του [ROADMAP §6](../ROADMAP.md#6-glitchtip-extras--έξοδος-πριν-από-την-παραγωγή).
* Η CSP της PWA στέλνει τις παραβιάσεις στο API (`/api/csp-report`).
* Το API τρέχει με `--enable-source-maps`: τα stack traces δείχνουν `.ts`.
* 1 migration: η αποδοχή του μηνύματος «Καταγραφή χρήσης» ανά λογαριασμό
  (δύο κολόνες στο `user`). Το μήνυμα εμφανίζεται μόνο αν είναι ρυθμισμένο
  replay ή analytics.
* Νέα προαιρετικά profiles: `replay` (OpenReplay, ~20 containers, ≥ 8 GB RAM)
  και `analytics` (Umami). Τα μυστικά `REPLAY_*`/`UMAMI_APP_SECRET`: βγάλ' τα με
  `docker run --rm …/config:<TAG> gen-env | grep -E '^(REPLAY_|UMAMI_)'` και
  βάλ' τα στο `.env.prod`· στήσιμο στο [`monitoring.md`](monitoring.md) §5–6.

**Στο `.env.prod` (προαιρετικά, [`monitoring.md`](monitoring.md) §3):**
`CSP_REPORT_FORWARD_URL` (Security Endpoint του project «pwa»),
`SOURCEMAP_UPLOAD_TOKEN` (source maps της PWA), και `SENTRY_EXTRAS=false` αν
**δεν** τα θέλεις στο ζωντανό σύστημα.

---

## Από v1.1.1

Η ρουτίνα του «Κάθε φορά», **με** το νέο `docker-compose.prod.yml`. Χωρίς αλλαγές
στο `.env.prod`.

**Τι αλλάζει:**

* Το compose: το API παίρνει τις ίδιες `SMTP_*` με το Authentik (στέλνει πλέον
  τους συνδέσμους των εντύπων με email)· το Authentik δεν περιμένει πια το Redis
  (δεν το χρησιμοποιεί από το 2025.10 — μένει μόνο για το GlitchTip).
* 2 migrations: η κατάσταση κάθε στοιχείου του ωρολογίου (kanban «Προγραμματικά»,
  όλα ξεκινούν «To Do») και η λίστα αγορών της Τροφοδοσίας (νέος πίνακας).
* Τα blueprints του Authentik (νέο config image): στην πρώτη εκκίνηση εφαρμόζουν
  πρώτα τα default που χρειάζονται, και το brand του Trifylli γίνεται πάντα το
  default. Σε υπάρχουσα στοίβα εφαρμόζονται μόνα τους μόλις αλλάξουν τα αρχεία —
  το χειροκίνητο `update authentik_brands_brand set "default"=true` δεν ξαναχρειάζεται.

**Αν ο server κόβει τις εξερχόμενες 25/465** (π.χ. Hetzner) και τα email δεν
φεύγουν (timeout): `SMTP_PORT=587`, `SMTP_USE_TLS=true`, `SMTP_USE_SSL=false`.

**Μετά:** ο κωδικός e-SEO του Τοπικού διορθώνεται πλέον από τις Ενσωματώσεις
(υπερδιαχειριστής) — όχι με SQL.

---

## Από v1.0.2

**Τι αλλάζει:**

* Το compose: νέες υπηρεσίες `predeploy-backup`, `backup-offsite` (restic),
  `watchdog`, και προαιρετικά το GlitchTip (profile `errors`).
* Τα δίκτυα: σταθερό subnet για το δίκτυο της στοίβας και νέο `trifylli-public`
  για τον proxy, ώστε οι θύρες να μένουν στον host (`BIND_ADDR=127.0.0.1`) αντί
  για το LAN.
* 18 migrations. Τα τέσσερα μετασχηματίζουν δεδομένα (υπεύθυνοι και υλικό του
  ωρολογίου, φιλοξενούμενα Τοπικά) χωρίς να χάνεται τίποτα — δοκιμάστηκαν σε βάση
  v1.0.2 με δεδομένα, και το σχήμα που βγαίνει ταιριάζει ακριβώς με τον κώδικα.

**Τι δεν αλλάζει:** τα volumes με τα δεδομένα (`postgres-data`, `garage-data`,
`authentik-media`, `redis-data`, `postgres-backups`) κρατούν τα ονόματά τους· με το
ίδιο όνομα στοίβας η νέα έκδοση βρίσκει τα ίδια δεδομένα. Ούτε οι εκδόσεις των
Postgres, Authentik, Redis και Garage αλλάζουν.

### 1. Πριν

* Αντίγραφο του τωρινού compose και του `.env.prod`. **Για rollback στη v1.0.2
  χρειάζεται το παλιό compose:** το νέο δεν σηκώνεται με `TAG=v1.0.2`, γιατί το
  config image εκείνης της έκδοσης δεν έχει `predeploy-backup`, `watchdog` και
  `restore-db`.
* Τα subnets της στοίβας να είναι ελεύθερα στον host — κενό αποτέλεσμα σημαίνει
  εντάξει, αλλιώς διάλεξε άλλα `STACK_SUBNET` / `PUBLIC_SUBNET`:

  ```bash
  docker network inspect $(docker network ls -q) \
    -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' | grep -E '10\.97\.5[01]\.'
  ```

* `docker volume ls | grep postgres-data`: το πρόθεμα είναι το όνομα της στοίβας
  και πρέπει να μείνει το ίδιο (στο Portainer: ενημέρωση της **ίδιας** στοίβας).

### 2. Το `.env.prod`

| Μεταβλητή | Τι βάζεις | Γιατί |
| :--- | :--- | :--- |
| `TAG` | τη νέα έκδοση | υποχρεωτικό πλέον |
| `OUCHTRACKER_TAG` | `v1.0.8` | όχι `latest` |
| `BACKUP_KEEP_WEEKS` / `BACKUP_KEEP_MONTHS` | `4` / `0` | η φόρμα υγείας λέει στους γονείς ότι κανένα αντίγραφο δεν ζει πάνω από 30 ημέρες |
| `BIND_ADDR` | `127.0.0.1` | οι θύρες μόνο στον host· ο proxy έρχεται από το `trifylli-public` (βήμα 3) |
| `AUTHENTIK_TRUSTED_PROXY_CIDRS` | σβήσ' το, αν το είχες ορίσει | το default εμπιστεύεται μόνο τα δίκτυα της στοίβας |
| `RESTIC_PASSWORD` | `openssl rand -base64 32` | κρυπτογραφεί τα αντίγραφα εκτός server — φύλαξέ το |
| `RESTIC_REPOSITORY` (+ κλειδιά) | B2, Storage Box ή NAS — παραδείγματα στο `.env.prod.example` | χωρίς αυτό το `backup-offsite` μένει «unhealthy» |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | από το `gen-env`, παρακάτω | push στο κινητό· χωρίς αυτά οι ειδοποιήσεις μένουν στο καμπανάκι |
| `VAPID_SUBJECT` | `mailto:<το email σου>` | το ζητούν οι υπηρεσίες push |

Τα κλειδιά VAPID βγαίνουν **μία φορά** — με νέο ζεύγος οι συσκευές που έχουν ήδη
ενεργό push πρέπει να το ξανανοίξουν:

```bash
docker run --rm ghcr.io/athamour1/trifylli/config:<TAG> gen-env | grep '^VAPID_'
```

Προαιρετικά: `HEARTBEAT_*` και `DISK_ALERT_PERCENT` ([`monitoring.md`](monitoring.md)),
`API_SENTRY_DSN` / `WEB_SENTRY_DSN` με `COMPOSE_PROFILES=errors` και `GLITCHTIP_*`,
`API_MEM_LIMIT` (768m), `PREDEPLOY_KEEP_DAYS` (30).

### 3. Ο proxy

* **Σε Docker:** μετά το `up` — το δίκτυο το φτιάχνει η στοίβα —
  `docker network connect trifylli-public <container του proxy>`, και στόχοι
  `trifylli-web:80`, `trifylli-api:3000`, `trifylli-sso:9000`, `trifylli-ouch:80`.
* **Στον host:** `127.0.0.1` με τις θύρες του README.
* **WebSocket στο `api.`** (`/api/collab`) — README, «WebSocket». Χωρίς αυτό τα
  κοινά κείμενα μένουν «εκτός σύνδεσης»: ό,τι γράφεται κρατιέται στη συσκευή και
  δεν φτάνει ούτε στον server ούτε στους άλλους.

Από το `up` ως την αλλαγή του proxy η εφαρμογή δεν φτάνεται απ' έξω — λίγα λεπτά,
κάν' το σε ήσυχη ώρα.

### 4. Σήκωμα και έλεγχος

Το `dc pull` + `dc up -d` και ο έλεγχος του «Κάθε φορά», και επιπλέον:

* Το δίκτυο της στοίβας πήρε το νέο subnet (αν δείχνει το παλιό, `dc down` —
  **χωρίς** `-v` — και ξανά `dc up -d`):

  ```bash
  docker network inspect <στοίβα>_default -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
  ```

* Συνεργασία: το ίδιο κείμενο σε δύο καρτέλες — ό,τι γράφεται στη μία φαίνεται
  αμέσως στην άλλη. Κάθε παλιό κείμενο γίνεται κοινό έγγραφο την πρώτη φορά που
  ανοίγει, μόνο του.
* Push: Ρυθμίσεις → «Push σε αυτή τη συσκευή».
* Αντίγραφο εκτός server, τώρα αντί για αύριο: `dc exec backup-offsite offsite-backup once`·
  στον επόμενο έλεγχο υγείας το `dc ps backup-offsite` δείχνει «healthy».
* Τα checks της παρακολούθησης ([`monitoring.md`](monitoring.md)).

### 5. Επιστροφή στη v1.0.2

Ό,τι γράφτηκε μετά την αναβάθμιση χάνεται. Η επαναφορά γίνεται με το **νέο**
compose (εκείνο έχει το `restore-db`), από το dump της ώρας της αναβάθμισης — κάθε
επόμενο `up` κρατά καινούριο dump, με το νέο σχήμα:

```bash
dc stop api web authentik-server authentik-worker ouchtracker-backend
dc run --rm --entrypoint ls predeploy-backup -lt /backups/predeploy
dc run --rm -e CONFIRM=trifylli --entrypoint restore-db predeploy-backup \
  trifylli /backups/predeploy/trifylli-<ώρα>.dump
# Το ίδιο για authentik και ouchtracker, από την ίδια ώρα. ΧΩΡΙΣ COLLAB_RESET:
# η v1.0.2 δεν έχει κοινά έγγραφα.
```

Μετά βάζεις πίσω το παλιό compose και `.env.prod` (`TAG=v1.0.2`) και
`dc up -d --remove-orphans` — σβήνει τα containers των υπηρεσιών που δεν ξέρει η
v1.0.2.
