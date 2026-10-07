-- CreateEnum
CREATE TYPE "DrasiFormType" AS ENUM ('SYMMETOXI', 'YGEIA');

-- CreateEnum
CREATE TYPE "DrasiFormStatus" AS ENUM ('PENDING', 'SENT', 'OPENED', 'SUBMITTED', 'VOID');

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('GONEAS', 'KIDEMONAS', 'IDIOS');

-- CreateTable
CREATE TABLE "drasi_form" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "type" "DrasiFormType" NOT NULL,
    "status" "DrasiFormStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sentTo" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedIp" TEXT,
    "data" JSONB,
    "signerName" TEXT,
    "signerRole" "SignerRole",
    "signatureFileId" UUID,
    "purgeAfter" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_pharmacy_kit" (
    "drasiId" UUID NOT NULL,
    "pharmacyKitId" UUID NOT NULL,

    CONSTRAINT "drasi_pharmacy_kit_pkey" PRIMARY KEY ("drasiId","pharmacyKitId")
);

-- CreateIndex
CREATE UNIQUE INDEX "drasi_form_tokenHash_key" ON "drasi_form"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "drasi_form_signatureFileId_key" ON "drasi_form"("signatureFileId");

-- CreateIndex
CREATE INDEX "drasi_form_drasiId_status_idx" ON "drasi_form"("drasiId", "status");

-- CreateIndex
CREATE INDEX "drasi_form_purgeAfter_idx" ON "drasi_form"("purgeAfter");

-- CreateIndex
CREATE UNIQUE INDEX "drasi_form_participantId_type_key" ON "drasi_form"("participantId", "type");

-- AddForeignKey
ALTER TABLE "drasi_form" ADD CONSTRAINT "drasi_form_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_form" ADD CONSTRAINT "drasi_form_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "drasi_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_form" ADD CONSTRAINT "drasi_form_signatureFileId_fkey" FOREIGN KEY ("signatureFileId") REFERENCES "stored_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_pharmacy_kit" ADD CONSTRAINT "drasi_pharmacy_kit_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_pharmacy_kit" ADD CONSTRAINT "drasi_pharmacy_kit_pharmacyKitId_fkey" FOREIGN KEY ("pharmacyKitId") REFERENCES "pharmacy_kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
