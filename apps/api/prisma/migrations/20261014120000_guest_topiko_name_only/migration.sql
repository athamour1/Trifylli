-- Τα φιλοξενούμενα Τοπικά γράφονται μόνο με όνομα: για άλλα Τοπικά το e-SEO δεν
-- δίνει τίποτα παραπάνω, οπότε ο κωδικός δεν πρόσθετε τίποτα.

-- DropIndex
DROP INDEX "drasi_guest_topiko_drasiId_topikoCode_key";

-- AlterTable
ALTER TABLE "drasi_guest_topiko" DROP COLUMN "topikoCode";

-- CreateIndex
CREATE INDEX "drasi_guest_topiko_drasiId_idx" ON "drasi_guest_topiko"("drasiId");

-- Οι φιλοξενούμενοι κρατούσαν τον ίδιο κωδικό· πλέον μόνο το σήμα (τα εξωτερικά
-- στελέχη έχουν ήδη `EXT`).
UPDATE "user" SET "guestTopikoCode" = 'GUEST' WHERE "guestTopikoCode" IS NOT NULL AND "guestTopikoCode" <> 'EXT';
