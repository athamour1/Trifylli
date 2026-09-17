-- CreateEnum
CREATE TYPE "TreasuryEntryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "PaymentHandlingStatus" AS ENUM ('EISPRAXTHIKE', 'PARADOTHIKE', 'KATATETHIKE', 'TAKTOPOIITHIKE');

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "collectedById" UUID,
ADD COLUMN     "handlingStatus" "PaymentHandlingStatus";

-- CreateTable
CREATE TABLE "stored_file" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "kladosId" UUID,
    "purpose" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_entry" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "kladosId" UUID,
    "kind" "TreasuryEntryKind" NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "occurredAt" DATE NOT NULL,
    "description" TEXT,
    "donorType" TEXT,
    "receiptFileId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_file_objectKey_key" ON "stored_file"("objectKey");

-- CreateIndex
CREATE INDEX "stored_file_topikoId_kladosId_purpose_idx" ON "stored_file"("topikoId", "kladosId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_entry_receiptFileId_key" ON "treasury_entry"("receiptFileId");

-- CreateIndex
CREATE INDEX "treasury_entry_topikoId_kladosId_occurredAt_idx" ON "treasury_entry"("topikoId", "kladosId", "occurredAt");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entry" ADD CONSTRAINT "treasury_entry_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entry" ADD CONSTRAINT "treasury_entry_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entry" ADD CONSTRAINT "treasury_entry_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "stored_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entry" ADD CONSTRAINT "treasury_entry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
