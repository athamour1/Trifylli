-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DrasiReviewKind" ADD VALUE 'PARAGRAPH';
ALTER TYPE "DrasiReviewKind" ADD VALUE 'CHOICE';
ALTER TYPE "DrasiReviewKind" ADD VALUE 'CHECKBOX';
ALTER TYPE "DrasiReviewKind" ADD VALUE 'SCALE_1_10';

-- AlterTable
ALTER TABLE "drasi" ADD COLUMN     "reviewSettings" JSONB;

-- AlterTable
ALTER TABLE "drasi_review_answer" ADD COLUMN     "choices" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "drasi_review_question" ADD COLUMN     "description" TEXT,
ADD COLUMN     "options" JSONB,
ADD COLUMN     "required" BOOLEAN NOT NULL DEFAULT false;

