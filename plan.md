# Trifylli App

- Klados(asteria, poulia, odhgoi, mo)
  - calendar
  - parousiologio
  - atomikh proodos
  - yliko
    - leitourgiko
    - programmatiko
  - draseis
    - monohmera/polyhmera
    - kataskhnwsh
  - syggentrwseis
    - timeline
    - diathesimothta apo stelexoi
    - ylika pou xreiazontai
    - Anoigma
    - Kleisimo
    - kyurio meros (diafora kommatia)
    - symboulia (omadas/ypefthinwn/enwmotias)
      - agenta
      - praktika
      - calendar easy view
      
- Topiko
  - calendar
  - yliko (emfanhsh kai to yliko twn kladwn)
    - programmatika
    - leitourgika 
  - farmakeio (ouchtracker intergration)
  - meloi (na ta travaei apo to eseo mallon)
    - syndromes ana atomo
    - filtra swsta
    - stoixeia
  - draseis
    - monohmera/polyhmera
    - kataskhnwseis
      - stoixeia ana kataskhnwsh ana klado
        - atoma
        - stelexoi
        - kataskhnwtes
        - ti yliko exoun parei
  - symvoulia(2 typwn topikou/stelexwn)
    - agenta
    - praktika
    - calendar easy view
  
    
# Trifylli App: Αρχιτεκτονική & Πλάνο Ανάπτυξης

Έγγραφο προδιαγραφών και οδικός χάρτης υλοποίησης για το σύστημα διαχείρισης Τοπικού Τμήματος του Σώματος Ελληνικού Οδηγισμού (Σ.Ε.Ο.).

---

## 1. Τεχνολογική Στοίβα (Tech Stack)

*   **Frontend (PWA):** Quasar Framework (Vue 3, Vite, TypeScript, Pinia). Επιλογή PWA για Offline-First λειτουργία κατά τη διάρκεια κατασκηνώσεων.
*   **Backend (API):** NestJS (TypeScript, REST/GraphQL).
*   **Database & ORM:** PostgreSQL 15+ με Prisma ORM.
*   **Authentication & SSO:** Authentik (RBAC, διαχείριση ρόλων χρηστών).
*   **Infrastructure:** Docker & Docker Compose (Dev/Prod environments).

---

## 2. Δομή Λειτουργιών (Feature Map)

### 2.1. Επίπεδο Κλάδου (Αστέρια, Πουλιά, Οδηγοί, Μεγάλοι Οδηγοί)
Αφορά την καθημερινή λειτουργία και τον προγραμματισμό από τα στελέχη του κάθε κλάδου.

*   **Ημερολόγιο (Calendar):** Προβολή δράσεων, συγκεντρώσεων και συμβουλίων του κλάδου.
*   **Μέλη & Πρόοδος:**
    *   Παρουσιολόγιο συγκεντρώσεων.
    *   Ατομική πρόοδος μελών (καταγραφή στόχων/ολοκληρωμένων σταδίων).
*   **Υλικό Κλάδου:**
    *   Λειτουργικό (σκηνές, εργαλεία).
    *   Προγραμματιστικό (γραφική ύλη, αναλώσιμα).
*   **Δράσεις (Μονοήμερες / Πολυήμερες / Κατασκήνωση):**
    *   Σύνδεση με απαιτούμενο υλικό.
    *   Καταγραφή συμμετεχόντων.
*   **Συγκεντρώσεις (Timeline & Σχεδιασμός):**
    *   Διαθεσιμότητα από στελέχη.
    *   Απαιτούμενα υλικά.
    *   Χρονοδιάγραμμα: Άνοιγμα, Κύριο Μέρος (διάφορα κομμάτια), Κλείσιμο.
*   **Συμβούλια (Ομάδας / Υπευθύνων / Ενωμοτίας):**
    *   Ατζέντα θεμάτων.
    *   Πρακτικά συζήτησης.
    *   Calendar Easy View.

### 2.2. Επίπεδο Τοπικού
Αφορά την εποπτεία, τα οικονομικά, την κεντρική αποθήκη και τη διοίκηση του Τμήματος.

*   **Κεντρικό Ημερολόγιο:** Συγκεντρωτική προβολή όλων των κλάδων και των δράσεων του Τοπικού.
*   **Κεντρική Αποθήκη (Υλικό):**
    *   Εμφάνιση όλου του λειτουργικού και προγραμματιστικού υλικού.
    *   Σύστημα "Checkout/Δέσμευσης" υλικού από τους κλάδους για αποφυγή διπλοκρατήσεων.
*   **Φαρμακείο & Ασφάλεια:**
    *   Integration με Ouchtracker για διαχείριση τραυματισμών και φαρμακευτικού υλικού (ειδικά για κατασκηνώσεις).
*   **Διαχείριση Μελών & Οικονομικά:**
    *   Άντληση δεδομένων (προφίλ) μέσω e-SEO (API/Webhooks).
    *   Παρακολούθηση συνδρομών ανά άτομο.
    *   Σύνθετα φίλτρα αναζήτησης (ανά κλάδο, ηλικία, οφειλές).
*   **Συγκεντρωτικές Δράσεις & Κατασκηνώσεις:**
    *   Στοιχεία ανά κατασκήνωση και ανά κλάδο.
    *   Στατιστικά: Συνολικά άτομα, συμμετέχοντα στελέχη, κατασκηνωτές.
    *   Αναφορά δεσμευμένου υλικού κατασκήνωσης.
*   **Συμβούλια Τοπικού:**
    *   Διαχωρισμός σε Συμβούλια Τοπικού (Διοίκηση) και Συμβούλια Στελεχών.
    *   Ατζέντα, Πρακτικά και Easy View προβολή.

---

## 3. Μοντέλο Δεδομένων (Prisma Core Entities)

| Οντότητα (Model) | Βασικά Πεδία (Fields) | Σχέσεις (Relations) |
| :--- | :--- | :--- |
| **Topiko** | id, name, location | 1:N με Klados, 1:N με Symvoulio |
| **Klados** | id, type (Asteria, etc.), topikoId | 1:N με User, 1:N με Drasi, 1:N με Yliko |
| **User** | id, ssoId, role (Stelexos/Melos), status | N:M με Drasi (Συμμετοχές), 1:N με Ofeiles |
| **Drasi** | id, title, type, dateStart, dateEnd | 1:N με Syggentrwsh, N:M με Yliko, N:M με User |
| **Syggentrwsh**| id, drasiId, anoigma, kyrioMeros, kleisimo | N:M με Yliko (Απαιτούμενα) |
| **Symvoulio** | id, type, agenda, praktika, date | 1:N με Topiko ή Klados |
| **Yliko** | id, name, category, totalQty, kladosId | N:M με Drasi (Inventory Checkouts) |

---

## 4. Ενσωματώσεις (Integrations) & Εξωτερικά Συστήματα

1.  **Ouchtracker API:** Κλήσεις (REST) προς το υπάρχον σύστημα Ouchtracker του Τοπικού για άντληση του inventory του φαρμακείου και καταγραφή/ανάγνωση ιατρικών περιστατικών (πεδίο `farmakeio` στο Τοπικό).
2.  **e-SEO Sync Engine:** Cron job ή Webhook listener στο NestJS που θα τρέχει περιοδικά για να ενημερώνει τη βάση `User` με τα νέα μέλη, στοιχεία επικοινωνίας και καταστάσεις συνδρομών.
3.  **Authentik SSO:** Χρήση του Authentik ως Identity Provider (IdP) μέσω OIDC/OAuth2. Τα στελέχη κάνουν login και λαμβάνουν αυτόματα τα δικαιώματά τους βάσει των Groups (π.χ. `Stelexos-Poulia`, `Admin-Topiko`).

---

## 5. Φάσεις Υλοποίησης (Roadmap)

| Φάση | Αντικείμενο Υλοποίησης | Παραδοτέα |
| :--- | :--- | :--- |
| **Phase 1: Foundation** | Στήσιμο υποδομής, Docker Compose, Database. | Repositories, έτοιμα Dev περιβάλλοντα, Prisma Schema, Auth connection. |
| **Phase 2: Core API** | NestJS Controllers/Services για Μέλη, Κλάδους και Υλικό. | CRUD endpoints, RBAC Guards, Λογική δέσμευσης υλικού (Checkout). |
| **Phase 3: Frontend Views** | Quasar Layouts, Pinia Stores, Routing. | UI για Τοπικό (Dashboards) και Κλάδο (Ημερολόγιο, Παρουσίες). |
| **Phase 4: PWA & Offline** | Ρύθμιση Service Workers, τοπική αποθήκευση. | Λειτουργία παρουσιολογίου και ατζέντας χωρίς σύνδεση στο internet (Sync later). |
| **Phase 5: Integrations** | Σύνδεση με Ouchtracker και e-SEO. | Ολοκληρωμένη ροή φαρμακείου, αυτόματο sync μητρώου μελών. |
