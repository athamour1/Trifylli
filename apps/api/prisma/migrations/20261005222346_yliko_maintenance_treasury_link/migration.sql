-- AlterTable
ALTER TABLE "yliko_maintenance" ADD COLUMN     "treasuryEntryId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "yliko_maintenance_treasuryEntryId_key" ON "yliko_maintenance"("treasuryEntryId");

-- AddForeignKey
ALTER TABLE "yliko_maintenance" ADD CONSTRAINT "yliko_maintenance_treasuryEntryId_fkey" FOREIGN KEY ("treasuryEntryId") REFERENCES "treasury_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

