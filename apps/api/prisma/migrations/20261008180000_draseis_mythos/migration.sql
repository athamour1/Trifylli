
-- AlterTable
ALTER TABLE "drasi" ADD COLUMN     "mythosText" TEXT,
ADD COLUMN     "mythosTitle" TEXT;

-- CreateTable
CREATE TABLE "drasi_character" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lore" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "participantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_character_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drasi_character_drasiId_order_idx" ON "drasi_character"("drasiId", "order");

-- AddForeignKey
ALTER TABLE "drasi_character" ADD CONSTRAINT "drasi_character_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_character" ADD CONSTRAINT "drasi_character_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "drasi_participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

