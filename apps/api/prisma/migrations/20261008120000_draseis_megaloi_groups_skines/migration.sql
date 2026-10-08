-- AlterEnum
BEGIN;
CREATE TYPE "DrasiGroupKind_new" AS ENUM ('PENTADA', 'FOLIA', 'ENOMOTIA', 'SKINI', 'EPITROPI', 'OE');
ALTER TABLE "drasi_group" ALTER COLUMN "kind" TYPE "DrasiGroupKind_new" USING ("kind"::text::"DrasiGroupKind_new");
ALTER TABLE "drasi_group_member" ALTER COLUMN "kind" TYPE "DrasiGroupKind_new" USING ("kind"::text::"DrasiGroupKind_new");
ALTER TYPE "DrasiGroupKind" RENAME TO "DrasiGroupKind_old";
ALTER TYPE "DrasiGroupKind_new" RENAME TO "DrasiGroupKind";
DROP TYPE "public"."DrasiGroupKind_old";
COMMIT;

-- AlterTable
ALTER TABLE "drasi" ADD COLUMN     "hasSkines" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "drasi_group" ADD COLUMN     "scheduleItemId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "drasi_group_scheduleItemId_key" ON "drasi_group"("scheduleItemId");

-- AddForeignKey
ALTER TABLE "drasi_group" ADD CONSTRAINT "drasi_group_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "drasi_schedule_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

