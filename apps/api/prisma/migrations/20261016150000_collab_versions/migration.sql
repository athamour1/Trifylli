-- CreateTable
CREATE TABLE "collab_version" (
    "id" UUID NOT NULL,
    "document" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "writerIds" UUID[],
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collab_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_read" (
    "document" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_read_pkey" PRIMARY KEY ("document","userId")
);

-- CreateIndex
CREATE INDEX "collab_version_document_createdAt_idx" ON "collab_version"("document", "createdAt");

-- CreateIndex
CREATE INDEX "doc_read_versionId_idx" ON "doc_read"("versionId");

-- AddForeignKey
ALTER TABLE "doc_read" ADD CONSTRAINT "doc_read_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_read" ADD CONSTRAINT "doc_read_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "collab_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

