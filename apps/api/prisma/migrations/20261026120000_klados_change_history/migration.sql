-- Αλλαγή κλάδου από το e-SEO: η πρόοδος κρατιέται ανά κλάδο ως ιστορικό.
ALTER TABLE "membership" ADD COLUMN "source" "DataSource" NOT NULL DEFAULT 'LOCAL';

-- Τις τοποθετήσεις παιδιών μελών e-SEO τις άνοιξε ο συγχρονισμός.
UPDATE "membership" m SET "source" = 'ESEO'
FROM "user" u
WHERE u."id" = m."userId" AND u."source" = 'ESEO' AND m."kind" = 'MELOS';

ALTER TABLE "proodos_entry" ADD COLUMN "kladosId" UUID;

-- Οι υπάρχουσες εγγραφές ανήκουν στον κλάδο όπου είναι (ή ήταν τελευταία) μέλος το παιδί.
UPDATE "proodos_entry" e SET "kladosId" = (
  SELECT m."kladosId" FROM "membership" m
  WHERE m."userId" = e."userId" AND m."kind" = 'MELOS'
  ORDER BY (m."leftAt" IS NULL) DESC, m."joinedAt" DESC
  LIMIT 1
);

CREATE INDEX "proodos_entry_kladosId_userId_idx" ON "proodos_entry"("kladosId", "userId");
ALTER TABLE "proodos_entry" ADD CONSTRAINT "proodos_entry_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
