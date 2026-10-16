# Παρακολούθηση

> **Δοκιμάστηκε 2026-10-15** στο dev: heartbeats του watchdog (ok, και «δίσκος
> 83%» προς Uptime Kuma με ελληνικό μήνυμα), του backup (ok και fail με λάθος
> κωδικό), του offsite (fail χωρίς προορισμό) και των crons του API (μέσα από
> το DI του Nest)· GlitchTip 6.2.6 με πραγματικό 500 του API και σφάλμα της PWA —
> καθαρισμένα, με το ίδιο `requestId` στα logs.

Τέσσερα κομμάτια, από το πιο φθηνό:

| Τι | Πιάνει | Πού ζει |
| :--- | :--- | :--- |
| **Heartbeats** | backup που δεν έγινε, cron που απέτυχε, δίσκος που γεμίζει, server που έπεσε | Healthchecks ή Uptime Kuma |
| **Έλεγχοι απ' έξω** | ό,τι βλέπει ο χρήστης: DNS, TLS, proxy, «η σελίδα δεν ανοίγει» | UptimeRobot ή Uptime Kuma σε **άλλο** μηχάνημα |
| **Error tracking** | σφάλματα του κώδικα (API και PWA), με stack | GlitchTip (profile `errors`) |
| **Logs** | τι έγινε σε ένα συγκεκριμένο αίτημα | `docker logs` / Portainer, με `requestId` |

---

## 1. Heartbeats

Κάθε εργασία στέλνει **ok** όταν πετύχει και **fail** όταν αποτύχει — και όταν
δεν στείλει τίποτα στην ώρα της, η υπηρεσία ειδοποιεί μόνη της. Ένα URL ανά
εργασία στο `.env.prod`· κενό = κανένα ping.

Δύο υπηρεσίες δουλεύουν χωρίς αλλαγή στον κώδικα:

* **Healthchecks** — [healthchecks.io](https://healthchecks.io) (δωρεάν ως 20
  checks) ή self-hosted. Βάλε το ping URL του check· η αποτυχία πάει στο
  `…/fail`, με το μήνυμα στο body.
* **Uptime Kuma** — push monitor· το URL του έχει `/api/push/<token>`. Η
  αποτυχία στέλνει `status=down` με το μήνυμα.

| Μεταβλητή | Ποιος στέλνει | Περίοδος | Ανοχή |
| :--- | :--- | :--- | :--- |
| `HEARTBEAT_WATCHDOG_URL` | `watchdog` — δίσκος + postgres/redis/garage/api/web/authentik | 5 λεπτά | 10 λεπτά |
| `HEARTBEAT_BACKUP_URL` | `backup` — το ημερήσιο dump όλων των βάσεων | 1 ημέρα (00:00 UTC) | 2 ώρες |
| `HEARTBEAT_OFFSITE_URL` | `backup-offsite` — το αντίγραφο εκτός server | 1 ημέρα (από την εκκίνηση) | 6 ώρες |
| `HEARTBEAT_ESEO_SYNC_URL` | API — συγχρονισμός e-SEO | cron `0 4 * * *`, Europe/Athens | 1 ώρα |
| `HEARTBEAT_HEALTH_PURGE_URL` | API — καθάρισμα ιατρικών | cron `30 3 * * *`, UTC | 1 ώρα |
| `HEARTBEAT_IMAGE_SWEEP_URL` | API — σάρωση ορφανών εικόνων | cron `0 4 * * *`, UTC | 1 ώρα |
| `HEARTBEAT_PHARMACY_RETURNS_URL` | API — αυτόματες επιστροφές φαρμακείων | 1 ώρα | 30 λεπτά |
| `HEARTBEAT_PHARMACY_ACCESS_URL` | API — συγχρονισμός προσβάσεων φαρμακείων | 30 λεπτά | 30 λεπτά |
| `HEARTBEAT_DRASI_REMINDERS_URL` | API — υπενθυμίσεις «σε 10΄ αρχίζει» των δράσεων | 1 λεπτό | 5 λεπτά |

**Ο watchdog είναι και ο «νεκρός διακόπτης».** Αν πέσει ο server, το ρεύμα ή το
internet του σπιτιού, σταματούν τα pings του και ειδοποιείσαι μέσα σε 15 λεπτά —
χωρίς τίποτα να «κοιτάζει» από έξω. Όριο δίσκου: `DISK_ALERT_PERCENT` (85).

Μια εργασία που **δεν** τρέχει εδώ (π.χ. χωρίς e-SEO ή χωρίς OuchTracker) δεν
στέλνει ping — μη φτιάξεις check γι' αυτήν, αλλιώς θα δείχνει «down».

Τα μηνύματα περιέχουν μόνο ονόματα εργασιών, πλήθη και αιτίες σφαλμάτων (τα
emails γίνονται `***@***`) — κανένα δεδομένο μέλους.

**Δοκιμή:**

```bash
dc() { docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"; }
dc exec watchdog watchdog once           # ένας έλεγχος + ping
dc exec backup-offsite offsite-backup once
```

## 2. Έλεγχοι απ' έξω

Ο watchdog βλέπει τη στοίβα **από μέσα**· δεν βλέπει ένα DNS που έληξε, ένα
πιστοποιητικό, έναν proxy που δεν απαντά. Αυτά τα βλέπει μόνο κάτι που χτυπά τα
δημόσια URLs όπως ένας χρήστης — από **άλλο** δίκτυο: UptimeRobot (δωρεάν), ή
Uptime Kuma σε μηχάνημα έξω από το σπίτι.

| URL | Αναμένεται |
| :--- | :--- |
| `https://app.<domain>/` | 200 |
| `https://api.<domain>/api/health/ready` | 200 — **503** όταν δεν απαντά η βάση |
| `https://sso.<domain>/-/health/live/` | 200/204 |
| `https://ouch.<domain>/` | 200 |

Κάθε 5 λεπτά. (Το GlitchTip έχει κι αυτό uptime monitors, αλλά τρέχει στον ίδιο
server: δεν σου λέει ποτέ ότι έπεσε ο server.)

## 3. Error tracking (GlitchTip)

1. `COMPOSE_PROFILES=errors`, `GLITCHTIP_DOMAIN`, `GLITCHTIP_SECRET_KEY` στο
   `.env.prod`, ο υποτομέας `errors.` στον proxy (`trifylli-errors:8000`).
2. Πρώτος χρήστης (η εγγραφή είναι κλειστή):
   `dc exec glitchtip ./manage.py createsuperuser`
3. Ένας οργανισμός και δύο projects: **API** (Node) και **PWA** (Vue). Τα DSN
   στο `API_SENTRY_DSN` (με host `glitchtip:8000` — εσωτερικά) και
   `WEB_SENTRY_DSN` (με τον δημόσιο host — το στέλνει ο browser).
4. Ειδοποιήσεις: στο project, alert με email (θέλει `GLITCHTIP_EMAIL_URL`).

**Τι φεύγει:** τύπος και stack του σφάλματος, URL χωρίς query και με τα tokens ως
`:token`, id λογαριασμού, `requestId`, έκδοση. **Τι δεν φεύγει ποτέ:** body,
headers, cookies, email/IP/όνομα χρήστη, breadcrumbs, props των components,
τοπικές μεταβλητές, ερωτήματα βάσης — όλα κλειστά στο SDK, και ό,τι μείνει
περνά από καθαρισμό πριν φύγει. Τα 4xx (π.χ. «δεν έχετε δικαίωμα») και το «εκτός
σύνδεσης» δεν αναφέρονται: είναι αναμενόμενα. Διατήρηση: 30 ημέρες.

## 4. Logs

Το API γράφει JSON, μία γραμμή ανά αίτημα (μέθοδος, διαδρομή χωρίς query και
tokens, status, χρόνος, id λογαριασμού) και ανά μήνυμα — όλες με `requestId`.
Το ίδιο `requestId` επιστρέφεται στο header `X-Request-Id` και είναι tag στο
GlitchTip:

```bash
docker logs trifylli-prod-api-1 2>&1 | grep <requestId>
```

Περιστροφή: driver `local`, έως 10 × 20 MB ανά container (εβδομάδες ιστορικού).
