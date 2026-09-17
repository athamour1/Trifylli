-- Διαχωρισμός «λογαριασμού» από «εγγραφή μητρώου».
--
-- Πριν: ένα enum `Role` (MELOS…ADMIN_TOPIKOU) έκανε δύο δουλειές ταυτόχρονα —
-- έλεγε τι είναι κάποιος στο μητρώο ΚΑΙ τι μπορεί να κάνει στην εφαρμογή.
--
-- Μετά: το Τοπικό λειτουργεί με πέντε λογαριασμούς (ένας υπερδιαχειριστής,
-- ένας διαχειριστής ανά κλάδο) που ορίζει ο υπερδιαχειριστής μέσα από την
-- εφαρμογή· όλοι οι υπόλοιποι είναι εγγραφές μητρώου χωρίς πρόσβαση.
--
-- Η διάκριση παιδί/στέλεχος δεν χάνεται: μεταφέρεται στο `kind`, γιατί τα
-- στατιστικά κατασκήνωσης τη χρειάζονται ανεξάρτητα από την πρόσβαση.

CREATE TYPE "AccountRole" AS ENUM ('SUPER_ADMIN', 'KLADOS_ADMIN');
CREATE TYPE "MemberKind" AS ENUM ('MELOS', 'STELEXOS');

-- ── user ──
ALTER TABLE "user"
  ADD COLUMN "kind"          "MemberKind" NOT NULL DEFAULT 'MELOS',
  ADD COLUMN "accountRole"   "AccountRole",
  ADD COLUMN "adminKladosId" UUID,
  ADD COLUMN "lastLoginAt"   TIMESTAMP(3);

-- Ό,τι δεν ήταν απλό μέλος ήταν ενήλικο στέλεχος.
UPDATE "user" SET "kind" = 'STELEXOS' WHERE "role" <> 'MELOS';

ALTER TABLE "user" DROP COLUMN "role";

-- ── membership ──
ALTER TABLE "membership" ADD COLUMN "kind" "MemberKind" NOT NULL DEFAULT 'MELOS';
UPDATE "membership" SET "kind" = 'STELEXOS' WHERE "role" <> 'MELOS';
ALTER TABLE "membership" DROP COLUMN "role";

-- ── drasi_participant ──
DROP INDEX "drasi_participant_drasiId_role_idx";
ALTER TABLE "drasi_participant" ADD COLUMN "kind" "MemberKind" NOT NULL DEFAULT 'MELOS';
UPDATE "drasi_participant" SET "kind" = 'STELEXOS' WHERE "role" <> 'MELOS';
ALTER TABLE "drasi_participant" DROP COLUMN "role";

DROP TYPE "Role";

-- ── indexes & constraints ──
CREATE INDEX "drasi_participant_drasiId_kind_idx" ON "drasi_participant"("drasiId", "kind");
CREATE INDEX "user_accountRole_idx" ON "user"("accountRole");

-- Το email δένει την ταυτότητα του Authentik με τη λογαριασμό-εγγραφή, οπότε
-- δεν επιτρέπεται δεύτερη με το ίδιο. Τα NULL δεν συγκρούονται στην Postgres,
-- άρα τα μέλη χωρίς email δεν επηρεάζονται.
CREATE UNIQUE INDEX "user_topikoId_email_key" ON "user"("topikoId", "email");

ALTER TABLE "user" ADD CONSTRAINT "user_adminKladosId_fkey"
  FOREIGN KEY ("adminKladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
