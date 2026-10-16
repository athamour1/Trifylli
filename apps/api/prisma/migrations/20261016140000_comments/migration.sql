-- CreateTable
CREATE TABLE "comment" (
    "id" UUID NOT NULL,
    "document" TEXT NOT NULL,
    "field" TEXT,
    "anchorStart" TEXT,
    "anchorEnd" TEXT,
    "quote" TEXT,
    "body" TEXT NOT NULL,
    "mentionIds" UUID[],
    "authorId" UUID,
    "parentId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comment_document_createdAt_idx" ON "comment"("document", "createdAt");

-- CreateIndex
CREATE INDEX "comment_parentId_idx" ON "comment"("parentId");

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

