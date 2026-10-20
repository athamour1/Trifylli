-- Παράλληλα γεύματα (F16).
CREATE TABLE "drasi_meal_variant" (
  "id" UUID NOT NULL, "itemId" UUID NOT NULL, "order" INTEGER NOT NULL DEFAULT 0, "label" TEXT NOT NULL,
  "participantIds" UUID[], "menu" TEXT, "recipe" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drasi_meal_variant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drasi_meal_variant_itemId_order_idx" ON "drasi_meal_variant"("itemId", "order");
ALTER TABLE "drasi_meal_variant" ADD CONSTRAINT "drasi_meal_variant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_schedule_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "drasi_meal_variant_ingredient" (
  "id" UUID NOT NULL, "variantId" UUID NOT NULL, "order" INTEGER NOT NULL, "label" TEXT NOT NULL,
  "qty" TEXT NOT NULL DEFAULT '', "bought" BOOLEAN NOT NULL DEFAULT false, "boughtById" UUID, "boughtAt" TIMESTAMP(3),
  CONSTRAINT "drasi_meal_variant_ingredient_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drasi_meal_variant_ingredient_variantId_order_idx" ON "drasi_meal_variant_ingredient"("variantId", "order");
ALTER TABLE "drasi_meal_variant_ingredient" ADD CONSTRAINT "drasi_meal_variant_ingredient_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "drasi_meal_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
