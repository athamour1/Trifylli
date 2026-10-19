# Παρακολούθηση

> **Δοκιμάστηκε 2026-10-15** στο dev: heartbeats του watchdog (ok, και «δίσκος
> 83%» προς Uptime Kuma με ελληνικό μήνυμα), του backup (ok και fail με λάθος
> κωδικό), του offsite (fail χωρίς προορισμό) και των crons του API (μέσα από
> το DI του Nest)· GlitchTip 6.2.6 με πραγματικό 500 του API και σφάλμα της PWA —
> καθαρισμένα, με το ίδιο `requestId` στα logs.

Έξι κομμάτια, από το πιο φθηνό:

| Τι | Πιάνει | Πού ζει |
| :--- | :--- | :--- |
| **Heartbeats** | backup που δεν έγινε, cron που απέτυχε, δίσκος που γεμίζει, server που έπεσε | Healthchecks ή Uptime Kuma |
| **Έλεγχοι απ' έξω** | ό,τι βλέπει ο χρήστης: DNS, TLS, proxy, «η σελίδα δεν ανοίγει» | UptimeRobot ή Uptime Kuma σε **άλλο** μηχάνημα |
| **Error tracking** | σφάλματα του κώδικα (API και PWA), με stack | GlitchTip (profile `errors`) |
| **Logs** | τι έγινε σε ένα συγκεκριμένο αίτημα | `docker logs` / Portainer, με `requestId` |
| **Καταγραφή συνεδριών** | τι έκανε ο χρήστης πριν σκάσει κάτι — βίντεο της συνεδρίας | OpenObserve (profile `replay`) |
| **Analytics** | ποιες σελίδες χρησιμοποιούνται, πόσο, από τι συσκευές — ανώνυμα | Umami (profile `analytics`) |

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
* **GlitchTip** — heartbeat monitor (Uptime → New → Heartbeat)· το URL του έχει
  `/heartbeat_check/<id>/`. Δεν έχει «αποτυχία»: στο fail δεν στέλνουμε τίποτα
  και ειδοποιεί όταν περάσει το διάστημα. Το ίδιο το σφάλμα έχει ήδη φτάσει
  στο GlitchTip ως issue. **Μόνο για τα crons του API**: τρέχει στον ίδιο
  server, άρα για τον watchdog (τον «νεκρό διακόπτη») θέλεις υπηρεσία απ' έξω.

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

> **Δοκιμάστηκε 2026-10-19** στο dev (GlitchTip 6.2.6, SDK 11.7): είσοδος με
> Authentik (και απόρριψη χρήστη χωρίς λογαριασμό στο GlitchTip), σφάλματα,
> συναλλαγές με spans (HTTP, Prisma), logs, «Αναφορά προβλήματος», αναφορά CSP
> μέσω του API (με το token κομμένο), heartbeat, και source maps της PWA που
> ανέβηκαν από το image στην εκκίνηση και ξεδιάλυναν πραγματικό σφάλμα σε
> αρχείο/γραμμή/συνάρτηση.

### Στήσιμο (παραγωγή)

1. `COMPOSE_PROFILES=errors`, `GLITCHTIP_DOMAIN`, `GLITCHTIP_SECRET_KEY` στο
   `.env.prod`, ο υποτομέας `errors.` στον proxy (`trifylli-errors:8000`).
2. Πρώτος χρήστης (η εγγραφή είναι κλειστή):
   `dc exec glitchtip ./manage.py createsuperuser`
3. Οργανισμός **`trifylli`** και δύο projects: **`api`** (Node) και **`pwa`**
   (Vue). Τα DSN στο `API_SENTRY_DSN` (με host `glitchtip:8000` — εσωτερικά) και
   `WEB_SENTRY_DSN` (με τον δημόσιο host — το στέλνει ο browser).
4. **CSP:** το «Security Endpoint» του `pwa` (Settings → Client Keys) στο
   `CSP_REPORT_FORWARD_URL`, με τον εσωτερικό host. Βγαίνει και από το
   `WEB_SENTRY_DSN` (`https://<κλειδί>@errors.<domain>/<project>`):
   `http://glitchtip:8000/api/<project>/security/?glitchtip_key=<κλειδί>`. Το
   κλειδί και ο αριθμός είναι του **PWA**, όχι του API.
5. **Source maps της PWA:** token από Profile → Auth Tokens με
   `project:releases` στο `SOURCEMAP_UPLOAD_TOKEN`. Σε κάθε εκκίνηση το `web`
   ανεβάζει τα maps του image στο `pwa` (release `trifylli-web@<έκδοση>`) —
   στο log: `[entrypoint] source maps: ανέβηκαν`. Πάει στο **δημόσιο** URL
   (`GLITCHTIP_DOMAIN`): το GlitchTip δίνει URL upload με αυτό το host, οπότε
   ο server πρέπει να φτάνει το δικό του δημόσιο όνομα.
6. **Ειδοποιήσεις:** στο project → Alerts. Email (θέλει `GLITCHTIP_EMAIL_URL`)
   ή **webhook** (Discord, Slack-συμβατό, Google Chat) για ειδοποίηση στο κινητό
   σε δευτερόλεπτα.
7. **Είσοδος με Authentik (SSO):** στη σελίδα εισόδου υπάρχει «Log in with
   Authentik». Μπαίνει **μόνο** όποιος έχει ήδη χρήστη στο GlitchTip με το ίδιο
   email όπως στο Authentik — οι υπόλοιποι παίρνουν «signup closed». Το
   `glitchtip-sso` (σε κάθε `up`) ρυθμίζει τον provider και δένει τους χρήστες
   με το email τους· νέος χρήστης ⇒ `dc up glitchtip-sso` για να δεθεί. Θέλει
   `GLITCHTIP_OIDC_ISSUER` και `GLITCHTIP_OIDC_CLIENT_SECRET` (το βγάζει το
   `gen-env`· το ίδιο το διαβάζει και το Authentik). Ο server πρέπει να φτάνει το
   δημόσιο `sso.<domain>`. Το UI του GlitchTip **δεν** δέχεται emails σε `.local`
   (σφάλμα 500) — χρήστες με κανονικό domain.
8. **Releases:** τα σφάλματα έχουν release (`trifylli-api@…`, `trifylli-web@…`).
   «Resolve in next release» κλείνει ένα issue ως την επόμενη έκδοση· αν
   ξαναφανεί μετά, ανοίγει ξανά ως regression.

### Δοκιμή

Στην εφαρμογή, συνδεδεμένος: F12 → Console (αν δεν αφήνει paste: γράψε
`allow pasting`). Το `setTimeout` χρειάζεται — σφάλμα πεταμένο κατευθείαν στην
κονσόλα δεν περνά από το error tracking.

```js
// α) φτάνει στο GlitchTip, με tag `replay`
setTimeout(() => { throw new Error('Δοκιμή GlitchTip') })
// β) σφάλμα μέσα στον κώδικα — για τα source maps
setTimeout(() => document.querySelector('#q-app').__vue_app__.config.globalProperties.$router.push({ name: 'δεν-υπάρχει' }))
```

Σε λίγα δευτερόλεπτα, στο project PWA: το (β) εμφανίζεται ως «No error
message» (το vue-router δεν δίνει μήνυμα σε production) με stack σε
`vue-router.mjs` — αν βλέπεις `assets/index-….js:1:…`, τα source maps δεν
ανέβηκαν (`docker logs <web> | grep "source maps"`). Tags: `release`, και
`replay` με σύνδεσμο στη συνεδρία στο OpenObserve· breadcrumbs με τα τελευταία
βήματα. 4xx του API και «εκτός σύνδεσης» **δεν** αναφέρονται, εσκεμμένα.

### Στήσιμο (dev)

```bash
docker compose --profile errors up -d glitchtip     # UI: http://localhost:8082
docker compose exec glitchtip ./manage.py createsuperuser
```

Το SSO δουλεύει και στο dev (`http://localhost:9010` — ένας μικρός socat,
`glitchtip-sso-bridge`, κάνει το Authentik ορατό στο ίδιο URL και μέσα από το
GlitchTip). Ίδια βήματα 3–4· τα DSN στο `apps/api/.env` (`SENTRY_DSN`,
`CSP_REPORT_FORWARD_URL`) και στο `apps/web/.env` (`VITE_SENTRY_DSN`). Στο
`quasar dev` τα source maps είναι ήδη εκεί. Το dev GlitchTip έχει **MCP**
(`http://localhost:8082/mcp`): το `.mcp.json` του repo το δηλώνει στο Claude
Code — χρειάζεται μόνο `export GLITCHTIP_MCP_TOKEN=<token από Profile → Auth
Tokens>` πριν ανοίξει, και διαβάζει issues, traces και logs.

### Τι φεύγει — πάντα

Τύπος και stack του σφάλματος (στην PWA ξεδιαλυμένο από τα source maps), URL
χωρίς query και με τα tokens ως `:token`, id λογαριασμού, `requestId`, έκδοση.
**Ποτέ:** body, headers, cookies, email/IP/όνομα χρήστη, props των components,
τοπικές μεταβλητές, τιμές ερωτημάτων βάσης — όλα κλειστά στο SDK, και ό,τι
μείνει περνά από καθαρισμό πριν φύγει. Τα 4xx (π.χ. «δεν έχετε δικαίωμα») και το
«εκτός σύνδεσης» δεν αναφέρονται: είναι αναμενόμενα. Οι παραβιάσεις CSP περνούν
από το API (`/api/csp-report`), που κρατά μόνο τα γνωστά πεδία, κόβει tokens
και query και πετά το `script-sample`. Διατήρηση: 30 ημέρες.

### Τα «extras» — μόνο όσο είμαστε σε ανάπτυξη

`SENTRY_EXTRAS=true` (προεπιλογή στο compose **για τώρα**) ανοίγει επιπλέον:

| Τι | API | PWA |
| :--- | :--- | :--- |
| **Tracing** | κάθε αίτημα (εκτός health/CSP, 401–404) με spans Prisma και κλήσεων προς τα έξω | φόρτωμα σελίδας, πλοήγηση, κλήσεις στο API — με συνέχεια στο trace του API (`sentry-trace`) |
| **Logs** | κάθε γραμμή του Nest logger, με `context`/`requestId` | `console.warn/error`, μόνο το κείμενο (κανένα όρισμα) |
| **Breadcrumbs** | κλήσεις HTTP προς τα έξω | πλοήγηση, κλικ, κλήσεις fetch/xhr |
| **Αναφορά προβλήματος** | — | μενού λογαριασμού → GlitchTip «User Feedback» |

Ίδιοι κανόνες καθαρισμού (URL, tokens, emails). Ονόματα συναλλαγών ως «μορφή»
διαδρομής (`GET /api/draseis/:id`). `SENTRY_TRACES_SAMPLE_RATE` (0–1) για
λιγότερα traces. Γιατί **δεν** μένουν στην κανονική παραγωγή και πώς φεύγουν:
[ROADMAP §6](../ROADMAP.md#6-glitchtip-extras--έξοδος-πριν-από-την-παραγωγή).

## 4. Logs

Το API γράφει JSON, μία γραμμή ανά αίτημα (μέθοδος, διαδρομή χωρίς query και
tokens, status, χρόνος, id λογαριασμού) και ανά μήνυμα — όλες με `requestId`.
Το ίδιο `requestId` επιστρέφεται στο header `X-Request-Id` και είναι tag στο
GlitchTip:

```bash
docker logs trifylli-prod-api-1 2>&1 | grep <requestId>
```

Περιστροφή: driver `local`, έως 10 × 20 MB ανά container (εβδομάδες ιστορικού).

## 5. Καταγραφή συνεδριών (OpenObserve)

> **Δοκιμάστηκε 2026-10-19** στο dev (OpenObserve v1.1.1 open source, SDK
> `@openobserve/browser-rum` 0.4.3): μήνυμα ενημέρωσης → αποδοχή → εγγραφή →
> αναπαραγωγή στο UI, και από σφάλμα του GlitchTip (tag `replay`) στην ίδια
> συνεδρία. Ένα container, ~200–300 MB RAM (το OpenReplay που αντικατέστησε:
> ~2,3 GB, 24 containers).

**Απόφαση του Τοπικού (2026-10-19):** χωρίς masking (`defaultPrivacyLevel:
'allow'`): κείμενα, πεδία και emails φαίνονται στο replay. Οι κλήσεις δικτύου
γράφονται ως resources (URL, χρόνος, status) — όχι headers ούτε bodies. Είναι από
τα extras της [ROADMAP §6](../ROADMAP.md#6-glitchtip-extras--έξοδος-πριν-από-την-παραγωγή).

**Πότε καταγράφει:** μόνο αφού ο λογαριασμός αποδεχτεί το μήνυμα «Καταγραφή
χρήσης» (μία φορά ανά λογαριασμό και έκδοση κειμένου· η αποδοχή γράφεται στη
βάση — `trackingNoticeAcceptedAt` — και στο audit log). **Ποτέ** στις δημόσιες
σελίδες των γονιών (έντυπα, αξιολόγηση): εκεί δεν υπάρχει λογαριασμός. Νέο
κείμενο ή αλλαγή στο τι καταγράφεται ⇒ `TRACKING_NOTICE_VERSION` +1 στο shared.
Κάθε σφάλμα της PWA στο GlitchTip έχει tag `replay` με σύνδεσμο στην εγγραφή.

**Ποιος βλέπει:** όποιος έχει λογαριασμό στο ίδιο το OpenObserve — ο root
(`OPENOBSERVE_ROOT_*`) και όσους φτιάξεις στο IAM του. Open-source έκδοση
(AGPL), χωρίς SSO: για ένα Τοπικό με έναν άνθρωπο που βλέπει τα replays, το SSO
(Enterprise + Dex + δεύτερος υποτομέας) ήταν περισσότερος κόπος από όφελος.
Κράτα τον κωδικό του root στο password manager· δεν περνά από το MFA του Authentik.

### Στήσιμο (παραγωγή)

1. `replay` στο `COMPOSE_PROFILES`, `OPENOBSERVE_URL` (`https://observe.<domain>`),
   `OPENOBSERVE_ROOT_EMAIL` — τον κωδικό τον βγάζει το `gen-env`. Υποτομέας στον
   proxy: `observe.` → `trifylli-observe:5080`.
2. Είσοδος με τον root → **Data → Data sources** → RUM (στη v1.1.1 δεν
   λέγεται «Ingestion») → το `clientToken` (`rum…`) στο `OPENOBSERVE_RUM_TOKEN`
   → `up -d web`. Ή κατευθείαν από το API:
   `curl -s -u '<root email>:<root κωδικός>' https://observe.<domain>/api/default/rumtoken`.

Το «Source Maps» του OpenObserve μένει **άδειο**: αφορά μόνο το δικό του Error
Tracking. Τα σφάλματα (με source maps) τα βλέπουμε στο GlitchTip· το
OpenObserve το χρησιμοποιούμε για το replay, που δεν θέλει maps.

Εγγραφές: 30 ημέρες (`ZO_COMPACT_DATA_RETENTION_DAYS`). Δεν μπαίνουν στα backups.

### Στήσιμο (dev)

```bash
docker compose --profile replay up -d     # UI: http://localhost:5080
```

`admin@trifylli.gr` / `Trifylli-dev-1`· το token στο `VITE_OPENOBSERVE_RUM_TOKEN`
του `apps/web/.env`. Στο dev οι γραμματοσειρές/εικονίδια μπορεί να μη φαίνονται
στο replay.

## 6. Analytics (Umami)

Ανώνυμα στατιστικά: σελίδες, χρόνοι, συσκευές, χώρες. **Χωρίς cookies, χωρίς
IP, χωρίς λογαριασμό** — άρα χωρίς banner συναίνεσης· αναφέρεται στο μήνυμα
«Καταγραφή χρήσης» για διαφάνεια. Κάθε URL φεύγει ως «μορφή» διαδρομής
(`/draseis/:id`, `/forms/:token`): χωρίς query, χωρίς tokens δημόσιων συνδέσμων.
Μόνιμο — δεν είναι από τα extras της ROADMAP §6.

### Στήσιμο

1. `analytics` στο `COMPOSE_PROFILES`, `UMAMI_URL` (π.χ. `https://analytics.<domain>`)
   — το `UMAMI_APP_SECRET` το βγάζει το `gen-env`. Ο υποτομέας στον proxy →
   `trifylli-analytics:3000`. Βάση `umami` στον ίδιο Postgres (τη φτιάχνει το `umami-db`).
2. Είσοδος **admin / umami** → άλλαξε αμέσως τον κωδικό (Settings → Profile).
3. Settings → Websites → Add website (domain της εφαρμογής) → το id στο
   `UMAMI_WEBSITE_ID` → `up -d web`.

Dev: `docker compose --profile analytics up -d umami` → http://localhost:8083, το
id στο `VITE_UMAMI_WEBSITE_ID`. Η βάση `umami` **δεν** μπαίνει στο ημερήσιο
backup (μόνο trifylli/authentik/ouchtracker)· την παίρνει το dump πριν από κάθε deploy (`predeploy-backup`).
