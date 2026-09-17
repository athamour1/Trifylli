-- Το συμβούλιο ξαναγίνεται συνάντηση, όχι σύστημα διαχείρισης θεμάτων.
--
-- Πριν: κάθε θέμα ήταν εγγραφή με τίτλο, πρακτικά, απόφαση, υπεύθυνο και
-- προθεσμία. Στην πράξη ένα συμβούλιο κλάδου είναι δύο κείμενα — τι θα πούμε
-- και τι είπαμε — και μια λίστα με το ποιος ήταν εκεί.
--
-- Μετά: `agenda` (πριν) και `minutes` (κατά τη διάρκεια), και οι συμμετέχοντες
-- σε δικό τους πίνακα.
--
-- Τίποτα δεν πετιέται: τα θέματα γίνονται κείμενο Markdown μέσα στα δύο πεδία
-- πριν διαγραφεί ο πίνακας — οι τίτλοι στην ατζέντα, τα πρακτικά και οι
-- αποφάσεις στα πρακτικά.

-- ── 1. Νέες στήλες ──
ALTER TABLE "symvoulio" RENAME COLUMN "notes" TO "minutes";
ALTER TABLE "symvoulio" ADD COLUMN "agenda" TEXT;

-- ── 2. Τα θέματα γίνονται κείμενο ──
UPDATE "symvoulio" s
SET "agenda" = a.md
FROM (
  SELECT "symvoulioId", string_agg('- ' || "title", E'\n' ORDER BY "order") AS md
  FROM "agenda_item"
  GROUP BY "symvoulioId"
) a
WHERE a."symvoulioId" = s."id";

UPDATE "symvoulio" s
SET "minutes" = NULLIF(
  trim(both E'\n' FROM coalesce(s."minutes", '') || E'\n\n' || m.md),
  ''
)
FROM (
  SELECT "symvoulioId",
         string_agg(
           '## ' || "title"
             || coalesce(E'\n\n' || "minutes", '')
             || coalesce(E'\n\n**Απόφαση:** ' || "decision", '')
             || coalesce(E'\n\n**Προθεσμία:** ' || to_char("dueDate", 'DD/MM/YYYY'), ''),
           E'\n\n' ORDER BY "order"
         ) AS md
  FROM "agenda_item"
  GROUP BY "symvoulioId"
) m
WHERE m."symvoulioId" = s."id";

DROP TABLE "agenda_item";

-- ── 3. Συμμετέχοντες ──
CREATE TABLE "symvoulio_participant" (
    "symvoulioId" UUID NOT NULL,
    "userId"      UUID NOT NULL,

    CONSTRAINT "symvoulio_participant_pkey" PRIMARY KEY ("symvoulioId", "userId")
);

ALTER TABLE "symvoulio_participant"
  ADD CONSTRAINT "symvoulio_participant_symvoulioId_fkey"
  FOREIGN KEY ("symvoulioId") REFERENCES "symvoulio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "symvoulio_participant"
  ADD CONSTRAINT "symvoulio_participant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Όποιος προήδρευε ήταν προφανώς εκεί.
INSERT INTO "symvoulio_participant" ("symvoulioId", "userId")
SELECT "id", "chairId" FROM "symvoulio" WHERE "chairId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 4. Ένας τύπος για τον κλάδο ──
-- Η PostgreSQL δεν αφαιρεί τιμές από enum: φτιάχνουμε νέο και αλλάζουμε τύπο.
CREATE TYPE "SymvoulioType_new" AS ENUM ('KLADOU', 'TOPIKOU', 'STELEXON');

ALTER TABLE "symvoulio"
  ALTER COLUMN "type" TYPE "SymvoulioType_new"
  USING (
    CASE "type"::text
      WHEN 'OMADAS' THEN 'KLADOU'
      WHEN 'YPEFTHINON' THEN 'KLADOU'
      WHEN 'ENOMOTIAS' THEN 'KLADOU'
      ELSE "type"::text
    END
  )::"SymvoulioType_new";

DROP TYPE "SymvoulioType";
ALTER TYPE "SymvoulioType_new" RENAME TO "SymvoulioType";
