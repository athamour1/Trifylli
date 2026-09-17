-- CreateTable
CREATE TABLE "pharmacy_kit" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "kladosId" UUID,
    "name" TEXT NOT NULL,
    "ouchtrackerKitId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kit_loan" (
    "id" UUID NOT NULL,
    "pharmacyKitId" UUID NOT NULL,
    "toKladosId" UUID,
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "note" TEXT,
    "previousAssigneeIds" TEXT[],
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kit_loan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pharmacy_kit_topikoId_kladosId_idx" ON "pharmacy_kit"("topikoId", "kladosId");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacy_kit_topikoId_ouchtrackerKitId_key" ON "pharmacy_kit"("topikoId", "ouchtrackerKitId");

-- CreateIndex
CREATE INDEX "kit_loan_pharmacyKitId_returnedAt_idx" ON "kit_loan"("pharmacyKitId", "returnedAt");

-- CreateIndex
CREATE INDEX "kit_loan_returnedAt_dueAt_idx" ON "kit_loan"("returnedAt", "dueAt");

-- AddForeignKey
ALTER TABLE "pharmacy_kit" ADD CONSTRAINT "pharmacy_kit_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_kit" ADD CONSTRAINT "pharmacy_kit_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_loan" ADD CONSTRAINT "kit_loan_pharmacyKitId_fkey" FOREIGN KEY ("pharmacyKitId") REFERENCES "pharmacy_kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_loan" ADD CONSTRAINT "kit_loan_toKladosId_fkey" FOREIGN KEY ("toKladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
