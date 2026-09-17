-- AlterTable
ALTER TABLE "yliko_checkout" ADD COLUMN     "returnCondition" TEXT;

-- CreateTable
CREATE TABLE "yliko_maintenance" (
    "id" UUID NOT NULL,
    "ylikoId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "cost" DECIMAL(10,2),
    "date" DATE NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "yliko_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "yliko_maintenance_ylikoId_date_idx" ON "yliko_maintenance"("ylikoId", "date");

-- AddForeignKey
ALTER TABLE "yliko_maintenance" ADD CONSTRAINT "yliko_maintenance_ylikoId_fkey" FOREIGN KEY ("ylikoId") REFERENCES "yliko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yliko_maintenance" ADD CONSTRAINT "yliko_maintenance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
