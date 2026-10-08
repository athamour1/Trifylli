
-- CreateEnum
CREATE TYPE "YpiresiesRotation" AS ENUM ('NONE', 'DAILY', 'TWICE_DAILY');

-- AlterTable
ALTER TABLE "drasi" ADD COLUMN     "ypiresiesRotation" "YpiresiesRotation" NOT NULL DEFAULT 'DAILY';

-- CreateTable
CREATE TABLE "drasi_ypiresia" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DrasiRoleKind",
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_ypiresia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_ypiresia_responsible" (
    "ypiresiaId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "drasi_ypiresia_responsible_pkey" PRIMARY KEY ("ypiresiaId","userId")
);

-- CreateTable
CREATE TABLE "drasi_ypiresia_slot" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "half" INTEGER NOT NULL DEFAULT 0,
    "groupId" UUID NOT NULL,
    "ypiresiaId" UUID NOT NULL,

    CONSTRAINT "drasi_ypiresia_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drasi_ypiresia_drasiId_order_idx" ON "drasi_ypiresia"("drasiId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "drasi_ypiresia_drasiId_name_key" ON "drasi_ypiresia"("drasiId", "name");

-- CreateIndex
CREATE INDEX "drasi_ypiresia_slot_drasiId_date_idx" ON "drasi_ypiresia_slot"("drasiId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "drasi_ypiresia_slot_drasiId_date_half_groupId_key" ON "drasi_ypiresia_slot"("drasiId", "date", "half", "groupId");

-- AddForeignKey
ALTER TABLE "drasi_ypiresia" ADD CONSTRAINT "drasi_ypiresia_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_ypiresia_responsible" ADD CONSTRAINT "drasi_ypiresia_responsible_ypiresiaId_fkey" FOREIGN KEY ("ypiresiaId") REFERENCES "drasi_ypiresia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_ypiresia_responsible" ADD CONSTRAINT "drasi_ypiresia_responsible_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_ypiresia_slot" ADD CONSTRAINT "drasi_ypiresia_slot_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_ypiresia_slot" ADD CONSTRAINT "drasi_ypiresia_slot_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "drasi_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_ypiresia_slot" ADD CONSTRAINT "drasi_ypiresia_slot_ypiresiaId_fkey" FOREIGN KEY ("ypiresiaId") REFERENCES "drasi_ypiresia"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Μεταφορά: οι υπηρεσίες ζούσαν ως ρόλοι αρχηγείου (DrasiRole). Κάθε (δράση,
-- είδος υπηρεσίας) γίνεται υπηρεσία, οι κάτοχοι του ρόλου υπεύθυνοί της, και οι
-- παλιοί ρόλοι σβήνουν. Το φαρμακείο μένει ρόλος (είναι πλέον ρόλος αρχηγείου).
INSERT INTO "drasi_ypiresia" ("id", "drasiId", "name", "kind", "order")
SELECT gen_random_uuid(), r."drasiId",
  CASE r."kind"
    WHEN 'EXORAISMOS' THEN 'Εξωραϊσμός'
    WHEN 'PIATA' THEN 'Πλύσιμο πιάτων'
    WHEN 'MAGEIREMA' THEN 'Μαγείρεμα'
    WHEN 'SERVIRISMA' THEN 'Σερβίρισμα'
    WHEN 'KATHARIOTITA' THEN 'Καθαριότητα'
    WHEN 'SOS' THEN 'SOS'
  END,
  r."kind",
  CASE r."kind"
    WHEN 'EXORAISMOS' THEN 0 WHEN 'PIATA' THEN 1 WHEN 'MAGEIREMA' THEN 2
    WHEN 'SERVIRISMA' THEN 3 WHEN 'KATHARIOTITA' THEN 4 ELSE 5
  END
FROM (SELECT DISTINCT "drasiId", "kind" FROM "drasi_role"
      WHERE "kind" IN ('EXORAISMOS', 'PIATA', 'MAGEIREMA', 'SERVIRISMA', 'KATHARIOTITA', 'SOS')) r;

INSERT INTO "drasi_ypiresia_responsible" ("ypiresiaId", "userId")
SELECT DISTINCT y."id", r."userId"
FROM "drasi_role" r
JOIN "drasi_ypiresia" y ON y."drasiId" = r."drasiId" AND y."kind" = r."kind";

DELETE FROM "drasi_role" WHERE "kind" IN ('EXORAISMOS', 'PIATA', 'MAGEIREMA', 'SERVIRISMA', 'KATHARIOTITA', 'SOS');
