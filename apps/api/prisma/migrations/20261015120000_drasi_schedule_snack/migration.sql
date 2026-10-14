-- Ετικέτα κολατσιού (δεκατιανό/απογευματινό) σε στοιχείο του ωρολογίου: σερβίρεται
-- μέσα σε μια δραστηριότητα και μπαίνει κι αυτό στο διατροφολόγιο.

-- CreateEnum
CREATE TYPE "DrasiSnack" AS ENUM ('DEKATIANO', 'APOGEVMATINO');

-- AlterTable
ALTER TABLE "drasi_schedule_item" ADD COLUMN     "snack" "DrasiSnack";
