-- CreateEnum
CREATE TYPE "DrasiReviewKind" AS ENUM ('TEXT', 'SCALE_1_5');

-- CreateTable
CREATE TABLE "drasi_review_question" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "kind" "DrasiReviewKind" NOT NULL DEFAULT 'TEXT',

    CONSTRAINT "drasi_review_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_review_answer" (
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" INTEGER,
    "text" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_review_answer_pkey" PRIMARY KEY ("questionId","userId")
);

-- CreateIndex
CREATE INDEX "drasi_review_question_drasiId_order_idx" ON "drasi_review_question"("drasiId", "order");

-- AddForeignKey
ALTER TABLE "drasi_review_question" ADD CONSTRAINT "drasi_review_question_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_review_answer" ADD CONSTRAINT "drasi_review_answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "drasi_review_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_review_answer" ADD CONSTRAINT "drasi_review_answer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
