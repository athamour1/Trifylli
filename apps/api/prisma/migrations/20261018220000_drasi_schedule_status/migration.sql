-- CreateEnum
CREATE TYPE "DrasiScheduleStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "drasi_schedule_item" ADD COLUMN "status" "DrasiScheduleStatus" NOT NULL DEFAULT 'TODO';
