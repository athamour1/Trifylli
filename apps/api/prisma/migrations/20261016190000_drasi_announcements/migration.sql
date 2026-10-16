-- CreateTable
CREATE TABLE "drasi_announcement" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "roles" "DrasiRoleKind"[],
    "audienceIds" UUID[],
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_announcement_seen" (
    "announcementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_announcement_seen_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateIndex
CREATE INDEX "drasi_announcement_drasiId_createdAt_idx" ON "drasi_announcement"("drasiId", "createdAt");

-- AddForeignKey
ALTER TABLE "drasi_announcement" ADD CONSTRAINT "drasi_announcement_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_announcement" ADD CONSTRAINT "drasi_announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_announcement_seen" ADD CONSTRAINT "drasi_announcement_seen_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "drasi_announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_announcement_seen" ADD CONSTRAINT "drasi_announcement_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

