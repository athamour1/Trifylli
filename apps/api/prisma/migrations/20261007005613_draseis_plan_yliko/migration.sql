-- AlterTable
ALTER TABLE "syggentrwsh" ALTER COLUMN "kladosId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "symvoulio" ADD COLUMN     "drasiId" UUID;

-- AlterTable
ALTER TABLE "timeline_block" ADD COLUMN     "executorId" UUID;

-- CreateTable
CREATE TABLE "drasi_shopping_item" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "estimatedCost" DECIMAL(10,2),
    "assigneeId" UUID,
    "purchasedAt" TIMESTAMP(3),
    "treasuryEntryId" UUID,
    "ylikoId" UUID,
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_shopping_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_external_yliko" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "kladosId" UUID,
    "guestTopikoId" UUID,
    "responsibleId" UUID,
    "returnedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_external_yliko_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drasi_shopping_item_treasuryEntryId_key" ON "drasi_shopping_item"("treasuryEntryId");

-- CreateIndex
CREATE INDEX "drasi_shopping_item_drasiId_idx" ON "drasi_shopping_item"("drasiId");

-- CreateIndex
CREATE INDEX "drasi_external_yliko_drasiId_idx" ON "drasi_external_yliko"("drasiId");

-- CreateIndex
CREATE INDEX "symvoulio_drasiId_idx" ON "symvoulio"("drasiId");

-- AddForeignKey
ALTER TABLE "drasi_shopping_item" ADD CONSTRAINT "drasi_shopping_item_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_shopping_item" ADD CONSTRAINT "drasi_shopping_item_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_shopping_item" ADD CONSTRAINT "drasi_shopping_item_treasuryEntryId_fkey" FOREIGN KEY ("treasuryEntryId") REFERENCES "treasury_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_shopping_item" ADD CONSTRAINT "drasi_shopping_item_ylikoId_fkey" FOREIGN KEY ("ylikoId") REFERENCES "yliko"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_external_yliko" ADD CONSTRAINT "drasi_external_yliko_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_external_yliko" ADD CONSTRAINT "drasi_external_yliko_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_external_yliko" ADD CONSTRAINT "drasi_external_yliko_guestTopikoId_fkey" FOREIGN KEY ("guestTopikoId") REFERENCES "drasi_guest_topiko"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_external_yliko" ADD CONSTRAINT "drasi_external_yliko_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_block" ADD CONSTRAINT "timeline_block_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symvoulio" ADD CONSTRAINT "symvoulio_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
