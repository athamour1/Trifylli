-- CreateTable
CREATE TABLE "drasi_review_invite" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "status" "DrasiFormStatus" NOT NULL DEFAULT 'SENT',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_review_invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drasi_review_invite_participantId_key" ON "drasi_review_invite"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "drasi_review_invite_tokenHash_key" ON "drasi_review_invite"("tokenHash");

-- CreateIndex
CREATE INDEX "drasi_review_invite_drasiId_status_idx" ON "drasi_review_invite"("drasiId", "status");

-- AddForeignKey
ALTER TABLE "drasi_review_invite" ADD CONSTRAINT "drasi_review_invite_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_review_invite" ADD CONSTRAINT "drasi_review_invite_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "drasi_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

