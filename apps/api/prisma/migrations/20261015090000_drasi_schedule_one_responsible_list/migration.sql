-- Μία λίστα υπευθύνων ανά στοιχείο του ωρολογίου, όχι χωριστά διεξαγωγή και
-- υλοποίηση. Όποιος ήταν και στα δύο μένει μία φορά.
DELETE FROM "drasi_schedule_assignee" a
USING "drasi_schedule_assignee" b
WHERE a."itemId" = b."itemId"
  AND a."userId" = b."userId"
  AND a."duty" = 'YLOPOIISI'
  AND b."duty" = 'DIEXAGOGI';

-- AlterTable
ALTER TABLE "drasi_schedule_assignee" DROP CONSTRAINT "drasi_schedule_assignee_pkey",
DROP COLUMN "duty",
ADD CONSTRAINT "drasi_schedule_assignee_pkey" PRIMARY KEY ("itemId", "userId");

-- DropEnum
DROP TYPE "DrasiScheduleDuty";
