-- Αφαίρεση του κλάδου Ναυτοδηγών: το Τοπικό λειτουργεί με τέσσερις κλάδους
-- (Αστέρια, Πουλιά, Οδηγοί, Μεγάλοι Οδηγοί).
--
-- Η αλλαγή enum αποτυγχάνει αν υπάρχει έστω μία εγγραφή με την παλιά τιμή,
-- οπότε ο καθαρισμός προηγείται. Η διαγραφή του `klados` παρασύρει μέσω
-- cascade τα `membership`, `syggentrwsh` (και τις `parousia` τους) και τα
-- `proodos_goal`, ενώ σε `yliko`, `drasi`, `symvoulio` και `yliko_checkout`
-- το `kladosId` γίνεται NULL — δηλαδή περνούν στην ευθύνη του Τοπικού αντί
-- να χαθούν.
--
-- Τα μέλη δεν διαγράφονται: παραμένουν στο μητρώο του Τοπικού χωρίς
-- τοποθέτηση, ώστε να μπορούν να μεταφερθούν σε άλλον κλάδο.
DELETE FROM "klados" WHERE "type" = 'NAFTODIGOI';

-- AlterEnum
BEGIN;
CREATE TYPE "KladosType_new" AS ENUM ('ASTERIA', 'POULIA', 'ODIGOI', 'MEGALOI_ODIGOI');
ALTER TABLE "klados" ALTER COLUMN "type" TYPE "KladosType_new" USING ("type"::text::"KladosType_new");
ALTER TYPE "KladosType" RENAME TO "KladosType_old";
ALTER TYPE "KladosType_new" RENAME TO "KladosType";
DROP TYPE "public"."KladosType_old";
COMMIT;
