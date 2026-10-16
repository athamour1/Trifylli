-- AlterTable
ALTER TABLE "drasi_external_yliko" ADD COLUMN     "loadedAt" TIMESTAMP(3),
ADD COLUMN     "loadedById" UUID;

-- AlterTable
ALTER TABLE "drasi_meal_ingredient" ADD COLUMN     "boughtAt" TIMESTAMP(3),
ADD COLUMN     "boughtById" UUID;

-- AlterTable
ALTER TABLE "drasi_schedule_yliko_item" ADD COLUMN     "packedAt" TIMESTAMP(3),
ADD COLUMN     "packedById" UUID;

-- AlterTable
ALTER TABLE "drasi_shopping_item" ADD COLUMN     "purchasedById" UUID;

-- AlterTable
ALTER TABLE "yliko_checkout" ADD COLUMN     "loadedAt" TIMESTAMP(3),
ADD COLUMN     "loadedById" UUID;

-- AddForeignKey
ALTER TABLE "drasi_shopping_item" ADD CONSTRAINT "drasi_shopping_item_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_external_yliko" ADD CONSTRAINT "drasi_external_yliko_loadedById_fkey" FOREIGN KEY ("loadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yliko_checkout" ADD CONSTRAINT "yliko_checkout_loadedById_fkey" FOREIGN KEY ("loadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

