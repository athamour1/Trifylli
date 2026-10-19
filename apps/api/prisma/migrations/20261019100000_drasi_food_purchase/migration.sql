-- CreateTable
CREATE TABLE "drasi_food_purchase" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "qty" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "requestedById" UUID,
    "boughtAt" TIMESTAMP(3),
    "boughtById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_food_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drasi_food_purchase_drasiId_date_idx" ON "drasi_food_purchase"("drasiId", "date");

-- AddForeignKey
ALTER TABLE "drasi_food_purchase" ADD CONSTRAINT "drasi_food_purchase_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_food_purchase" ADD CONSTRAINT "drasi_food_purchase_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_food_purchase" ADD CONSTRAINT "drasi_food_purchase_boughtById_fkey" FOREIGN KEY ("boughtById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
