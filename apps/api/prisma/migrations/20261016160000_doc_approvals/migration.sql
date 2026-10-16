-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PROXEIRO', 'ELEGXOS', 'EGKRITHIKE');

-- CreateTable
CREATE TABLE "doc_approval" (
    "document" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PROXEIRO',
    "requestedById" UUID,
    "requestedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "approvedVersionId" UUID,
    "returnNote" TEXT,
    "changedAfter" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_approval_pkey" PRIMARY KEY ("document")
);

-- AddForeignKey
ALTER TABLE "doc_approval" ADD CONSTRAINT "doc_approval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_approval" ADD CONSTRAINT "doc_approval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_approval" ADD CONSTRAINT "doc_approval_approvedVersionId_fkey" FOREIGN KEY ("approvedVersionId") REFERENCES "collab_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

