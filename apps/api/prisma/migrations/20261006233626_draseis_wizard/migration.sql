-- CreateEnum
CREATE TYPE "DrasiStatus" AS ENUM ('PROSXEDIO', 'ENERGI', 'KLEISTI');

-- CreateEnum
CREATE TYPE "DrasiRoleKind" AS ENUM ('ARXIGOS', 'PROGRAMMA', 'LEITOURGIA', 'TAMIAS', 'TROFODOSIA', 'MAGEIRISSA', 'EXORAISMOS', 'PIATA', 'MAGEIREMA', 'SERVIRISMA', 'KATHARIOTITA', 'FARMAKEIO', 'SOS');

-- AlterTable
ALTER TABLE "drasi" ADD COLUMN     "status" "DrasiStatus" NOT NULL DEFAULT 'ENERGI';

-- CreateTable
CREATE TABLE "drasi_klados" (
    "drasiId" UUID NOT NULL,
    "kladosId" UUID NOT NULL,

    CONSTRAINT "drasi_klados_pkey" PRIMARY KEY ("drasiId","kladosId")
);

-- CreateTable
CREATE TABLE "drasi_guest_topiko" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "topikoCode" TEXT NOT NULL,
    "topikoName" TEXT NOT NULL,
    "kladoi" "KladosType"[],
    "contactName" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_guest_topiko_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_role" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "kind" "DrasiRoleKind" NOT NULL,
    "userId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drasi_guest_topiko_drasiId_topikoCode_key" ON "drasi_guest_topiko"("drasiId", "topikoCode");

-- CreateIndex
CREATE INDEX "drasi_role_userId_idx" ON "drasi_role"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "drasi_role_drasiId_kind_userId_key" ON "drasi_role"("drasiId", "kind", "userId");

-- AddForeignKey
ALTER TABLE "drasi_klados" ADD CONSTRAINT "drasi_klados_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_klados" ADD CONSTRAINT "drasi_klados_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_guest_topiko" ADD CONSTRAINT "drasi_guest_topiko_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_role" ADD CONSTRAINT "drasi_role_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_role" ADD CONSTRAINT "drasi_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: ο διοργανωτής κλάδος είναι και συμμετέχων. Οι δράσεις Τοπικού
-- (kladosId NULL) μένουν χωρίς γραμμή — το «ποιοι έρχονται» συμπληρώνεται από το UI.
INSERT INTO "drasi_klados" ("drasiId", "kladosId")
SELECT "id", "kladosId" FROM "drasi" WHERE "kladosId" IS NOT NULL
ON CONFLICT DO NOTHING;
