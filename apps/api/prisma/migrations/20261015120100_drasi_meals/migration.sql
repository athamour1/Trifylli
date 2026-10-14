-- Το διατροφολόγιο: για κάθε γεύμα του ωρολογίου τι τρώμε, η συνταγή και το
-- ποσολόγιο. Σβήνεται μαζί με το στοιχείο του ωρολογίου.

-- CreateTable
CREATE TABLE "drasi_meal" (
    "itemId" UUID NOT NULL,
    "menu" TEXT,
    "recipe" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_meal_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "drasi_meal_ingredient" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "qty" TEXT NOT NULL DEFAULT '',
    "bought" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "drasi_meal_ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drasi_meal_ingredient_itemId_order_idx" ON "drasi_meal_ingredient"("itemId", "order");

-- AddForeignKey
ALTER TABLE "drasi_meal" ADD CONSTRAINT "drasi_meal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_schedule_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_meal_ingredient" ADD CONSTRAINT "drasi_meal_ingredient_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_meal"("itemId") ON DELETE CASCADE ON UPDATE CASCADE;
