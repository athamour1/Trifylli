-- Το υλικό ενός στοιχείου του ωρολογίου γίνεται λίστα (όνομα, ποσότητα, «μπήκε
-- στο σακίδιο»), όπως στις συγκεντρώσεις. Τα είδη αποθήκης και το ελεύθερο
-- κείμενο που είχαν γραφτεί περνούν ως γραμμές της — δεν χάνεται τίποτα.

-- CreateTable
CREATE TABLE "drasi_schedule_yliko_item" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "packed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "drasi_schedule_yliko_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drasi_schedule_yliko_item_itemId_order_idx" ON "drasi_schedule_yliko_item"("itemId", "order");

-- AddForeignKey
ALTER TABLE "drasi_schedule_yliko_item" ADD CONSTRAINT "drasi_schedule_yliko_item_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_schedule_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Πρώτα τα είδη αποθήκης (με τη σειρά του ονόματος), μετά το ελεύθερο κείμενο.
INSERT INTO "drasi_schedule_yliko_item" ("id", "itemId", "order", "label", "qty")
SELECT gen_random_uuid(), sy."itemId",
       (row_number() OVER (PARTITION BY sy."itemId" ORDER BY y."name") - 1)::int,
       y."name", sy."qty"
FROM "drasi_schedule_yliko" sy
JOIN "yliko" y ON y."id" = sy."ylikoId";

INSERT INTO "drasi_schedule_yliko_item" ("id", "itemId", "order", "label", "qty")
SELECT gen_random_uuid(), i."id",
       (SELECT count(*) FROM "drasi_schedule_yliko" sy WHERE sy."itemId" = i."id")::int,
       btrim(i."ylikoNotes"), 1
FROM "drasi_schedule_item" i
WHERE btrim(coalesce(i."ylikoNotes", '')) <> '';

-- DropForeignKey
ALTER TABLE "drasi_schedule_yliko" DROP CONSTRAINT "drasi_schedule_yliko_itemId_fkey";

-- DropForeignKey
ALTER TABLE "drasi_schedule_yliko" DROP CONSTRAINT "drasi_schedule_yliko_ylikoId_fkey";

-- DropTable
DROP TABLE "drasi_schedule_yliko";

-- AlterTable
ALTER TABLE "drasi_schedule_item" DROP COLUMN "ylikoNotes";
