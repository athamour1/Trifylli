-- CreateEnum
CREATE TYPE "DrasiScheduleKind" AS ENUM ('DRASTIRIOTITA', 'GEVMA', 'XEKOURASI', 'METAKINISI', 'TELETI', 'YPIRESIA', 'ALLO');

-- DropForeignKey
ALTER TABLE "timeline_block" DROP CONSTRAINT "timeline_block_executorId_fkey";

-- AlterTable
ALTER TABLE "syggentrwsh" ALTER COLUMN "kladosId" SET NOT NULL;

-- AlterTable
ALTER TABLE "timeline_block" DROP COLUMN "executorId";

-- CreateTable
CREATE TABLE "drasi_schedule_item" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "kind" "DrasiScheduleKind" NOT NULL DEFAULT 'DRASTIRIOTITA',
    "location" TEXT,
    "description" TEXT,
    "responsibleId" UUID,
    "executorId" UUID,
    "ylikoNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_schedule_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_schedule_yliko" (
    "itemId" UUID NOT NULL,
    "ylikoId" UUID NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "drasi_schedule_yliko_pkey" PRIMARY KEY ("itemId","ylikoId")
);

-- CreateIndex
CREATE INDEX "drasi_schedule_item_drasiId_startsAt_idx" ON "drasi_schedule_item"("drasiId", "startsAt");

-- AddForeignKey
ALTER TABLE "drasi_schedule_item" ADD CONSTRAINT "drasi_schedule_item_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_schedule_item" ADD CONSTRAINT "drasi_schedule_item_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_schedule_item" ADD CONSTRAINT "drasi_schedule_item_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_schedule_yliko" ADD CONSTRAINT "drasi_schedule_yliko_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_schedule_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_schedule_yliko" ADD CONSTRAINT "drasi_schedule_yliko_ylikoId_fkey" FOREIGN KEY ("ylikoId") REFERENCES "yliko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

