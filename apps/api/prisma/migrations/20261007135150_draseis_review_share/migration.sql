-- Απαντών αξιολόγησης: χρήστης ΚΑΙ επισκέπτης κοινού συνδέσμου. Οι υπάρχουσες
-- απαντήσεις παίρνουν κλειδί `user:<userId>` ώστε να μη χαθεί τίποτα.
ALTER TABLE "drasi_review_answer" ADD COLUMN "respondentKey" TEXT;
UPDATE "drasi_review_answer" SET "respondentKey" = 'user:' || "userId"::text;
ALTER TABLE "drasi_review_answer" ALTER COLUMN "respondentKey" SET NOT NULL;
ALTER TABLE "drasi_review_answer" DROP CONSTRAINT "drasi_review_answer_pkey";
ALTER TABLE "drasi_review_answer" ADD CONSTRAINT "drasi_review_answer_pkey" PRIMARY KEY ("questionId", "respondentKey");
ALTER TABLE "drasi_review_answer" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "drasi_review_answer" ADD COLUMN "guestId" UUID;
CREATE INDEX "drasi_review_answer_userId_idx" ON "drasi_review_answer"("userId");

CREATE TABLE "drasi_review_guest" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drasi_review_guest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drasi_review_guest_drasiId_idx" ON "drasi_review_guest"("drasiId");
ALTER TABLE "drasi_review_guest" ADD CONSTRAINT "drasi_review_guest_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drasi_review_answer" ADD CONSTRAINT "drasi_review_answer_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "drasi_review_guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "drasi" ADD COLUMN "reviewShareTokenHash" TEXT, ADD COLUMN "reviewShareCreatedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "drasi_reviewShareTokenHash_key" ON "drasi"("reviewShareTokenHash");
