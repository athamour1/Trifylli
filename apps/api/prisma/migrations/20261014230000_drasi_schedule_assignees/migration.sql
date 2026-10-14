-- Πολλοί υπεύθυνοι ανά στοιχείο του ωρολογίου (διεξαγωγή και υλοποίηση), αντί
-- για έναν σε καθεμία. Οι ήδη ορισμένοι περνούν στον νέο πίνακα πριν σβηστούν
-- οι παλιές στήλες — δεν χάνεται κανείς.

-- CreateEnum
CREATE TYPE "DrasiScheduleDuty" AS ENUM ('DIEXAGOGI', 'YLOPOIISI');

-- CreateTable
CREATE TABLE "drasi_schedule_assignee" (
    "itemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "duty" "DrasiScheduleDuty" NOT NULL,

    CONSTRAINT "drasi_schedule_assignee_pkey" PRIMARY KEY ("itemId","duty","userId")
);

-- CreateIndex
CREATE INDEX "drasi_schedule_assignee_userId_idx" ON "drasi_schedule_assignee"("userId");

-- AddForeignKey
ALTER TABLE "drasi_schedule_assignee" ADD CONSTRAINT "drasi_schedule_assignee_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_schedule_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_schedule_assignee" ADD CONSTRAINT "drasi_schedule_assignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Οι υπάρχοντες υπεύθυνοι.
INSERT INTO "drasi_schedule_assignee" ("itemId", "userId", "duty")
SELECT "id", "responsibleId", 'DIEXAGOGI' FROM "drasi_schedule_item" WHERE "responsibleId" IS NOT NULL;
INSERT INTO "drasi_schedule_assignee" ("itemId", "userId", "duty")
SELECT "id", "executorId", 'YLOPOIISI' FROM "drasi_schedule_item" WHERE "executorId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "drasi_schedule_item" DROP CONSTRAINT "drasi_schedule_item_executorId_fkey";

-- DropForeignKey
ALTER TABLE "drasi_schedule_item" DROP CONSTRAINT "drasi_schedule_item_responsibleId_fkey";

-- AlterTable
ALTER TABLE "drasi_schedule_item" DROP COLUMN "executorId",
DROP COLUMN "responsibleId";
