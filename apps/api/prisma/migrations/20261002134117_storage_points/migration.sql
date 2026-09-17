-- AlterTable
ALTER TABLE "yliko" ADD COLUMN     "storagePointId" UUID;

-- CreateTable
CREATE TABLE "storage_point" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "kladosId" UUID,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_point_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage_point_topikoId_kladosId_idx" ON "storage_point"("topikoId", "kladosId");

-- AddForeignKey
ALTER TABLE "yliko" ADD CONSTRAINT "yliko_storagePointId_fkey" FOREIGN KEY ("storagePointId") REFERENCES "storage_point"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_point" ADD CONSTRAINT "storage_point_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_point" ADD CONSTRAINT "storage_point_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
