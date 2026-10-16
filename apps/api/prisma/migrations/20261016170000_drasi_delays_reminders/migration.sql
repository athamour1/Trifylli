-- CreateTable
CREATE TABLE "drasi_delay" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_delay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_reminder" (
    "itemId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_reminder_pkey" PRIMARY KEY ("itemId","startsAt")
);

-- CreateIndex
CREATE INDEX "drasi_delay_drasiId_idx" ON "drasi_delay"("drasiId");

-- AddForeignKey
ALTER TABLE "drasi_delay" ADD CONSTRAINT "drasi_delay_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_delay" ADD CONSTRAINT "drasi_delay_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_schedule_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_delay" ADD CONSTRAINT "drasi_delay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_reminder" ADD CONSTRAINT "drasi_reminder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_schedule_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

