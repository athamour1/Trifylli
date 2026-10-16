-- Ροή δραστηριότητας της δράσης (συνεργασία, Φ7) και πότε την είδε τελευταία
-- φορά κάθε στέλεχος — για το «τι άλλαξε από την τελευταία σου επίσκεψη».

-- CreateTable
CREATE TABLE "drasi_activity" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "actorId" UUID,
    "topic" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_visit" (
    "drasiId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_visit_pkey" PRIMARY KEY ("drasiId","userId")
);

-- CreateIndex
CREATE INDEX "drasi_activity_drasiId_updatedAt_idx" ON "drasi_activity"("drasiId", "updatedAt");

-- AddForeignKey
ALTER TABLE "drasi_activity" ADD CONSTRAINT "drasi_activity_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_activity" ADD CONSTRAINT "drasi_activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_visit" ADD CONSTRAINT "drasi_visit_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_visit" ADD CONSTRAINT "drasi_visit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

