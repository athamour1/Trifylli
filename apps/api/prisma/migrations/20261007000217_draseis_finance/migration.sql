-- CreateEnum
CREATE TYPE "DrasiFeeKind" AS ENUM ('PLIRIS', 'MEIOMENI', 'STELEXOS', 'DOREAN');

-- CreateEnum
CREATE TYPE "DrasiLedgerKind" AS ENUM ('PROKATAVOLI', 'EPISTROFI', 'APODOSI');

-- AlterTable
ALTER TABLE "drasi" ADD COLUMN     "costReduced" DECIMAL(10,2),
ADD COLUMN     "costStelexos" DECIMAL(10,2),
ADD COLUMN     "transportCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "drasi_participant" ADD COLUMN     "collectorId" UUID,
ADD COLUMN     "feeAmount" DECIMAL(10,2),
ADD COLUMN     "feeKind" "DrasiFeeKind" NOT NULL DEFAULT 'PLIRIS',
ADD COLUMN     "feeNote" TEXT,
ADD COLUMN     "transportAmount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "treasury_entry" ADD COLUMN     "drasiId" UUID;

-- CreateTable
CREATE TABLE "drasi_payment" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "handlingStatus" "PaymentHandlingStatus",
    "collectedById" UUID,
    "receiptFileId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_budget" (
    "drasiId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "planned" DECIMAL(10,2) NOT NULL,
    "targetPct" DECIMAL(5,4),

    CONSTRAINT "drasi_budget_pkey" PRIMARY KEY ("drasiId","category")
);

-- CreateTable
CREATE TABLE "drasi_ledger_entry" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "DrasiLedgerKind" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "occurredAt" DATE NOT NULL,
    "note" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drasi_payment_receiptFileId_key" ON "drasi_payment"("receiptFileId");

-- CreateIndex
CREATE INDEX "drasi_payment_participantId_paidAt_idx" ON "drasi_payment"("participantId", "paidAt");

-- CreateIndex
CREATE INDEX "drasi_ledger_entry_drasiId_userId_idx" ON "drasi_ledger_entry"("drasiId", "userId");

-- CreateIndex
CREATE INDEX "treasury_entry_drasiId_occurredAt_idx" ON "treasury_entry"("drasiId", "occurredAt");

-- AddForeignKey
ALTER TABLE "drasi_payment" ADD CONSTRAINT "drasi_payment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "drasi_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_payment" ADD CONSTRAINT "drasi_payment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_payment" ADD CONSTRAINT "drasi_payment_receiptFileId_fkey" FOREIGN KEY ("receiptFileId") REFERENCES "stored_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_budget" ADD CONSTRAINT "drasi_budget_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_ledger_entry" ADD CONSTRAINT "drasi_ledger_entry_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_ledger_entry" ADD CONSTRAINT "drasi_ledger_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_ledger_entry" ADD CONSTRAINT "drasi_ledger_entry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_participant" ADD CONSTRAINT "drasi_participant_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_entry" ADD CONSTRAINT "treasury_entry_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
