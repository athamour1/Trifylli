-- Τα στοιχεία ωρολογίου της δοκιμαστικής σχεδίασης (ώρες αντί για διάρκειες) σβήνονται· δεν υπάρχουν πραγματικά δεδομένα.
DELETE FROM "drasi_schedule_item";

-- DropIndex
DROP INDEX "drasi_schedule_item_drasiId_startsAt_idx";

-- AlterTable
ALTER TABLE "drasi" ADD COLUMN     "dayStartTimes" JSONB;

-- AlterTable
ALTER TABLE "drasi_schedule_item" DROP COLUMN "endsAt",
DROP COLUMN "startsAt",
ADD COLUMN     "date" DATE NOT NULL,
ADD COLUMN     "durationMin" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "drasi_schedule_item_drasiId_date_order_idx" ON "drasi_schedule_item"("drasiId", "date", "order");

