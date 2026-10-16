-- CreateTable
CREATE TABLE "drasi_headcount" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "groupKind" "DrasiGroupKind" NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "drasi_headcount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_headcount_check" (
    "headcountId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "absentIds" UUID[],
    "total" INTEGER NOT NULL,
    "checkedById" UUID,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_headcount_check_pkey" PRIMARY KEY ("headcountId","groupId")
);

-- CreateIndex
CREATE INDEX "drasi_headcount_drasiId_createdAt_idx" ON "drasi_headcount"("drasiId", "createdAt");

-- AddForeignKey
ALTER TABLE "drasi_headcount" ADD CONSTRAINT "drasi_headcount_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_headcount" ADD CONSTRAINT "drasi_headcount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_headcount_check" ADD CONSTRAINT "drasi_headcount_check_headcountId_fkey" FOREIGN KEY ("headcountId") REFERENCES "drasi_headcount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_headcount_check" ADD CONSTRAINT "drasi_headcount_check_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "drasi_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_headcount_check" ADD CONSTRAINT "drasi_headcount_check_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

