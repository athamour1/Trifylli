-- Επιλογή στελεχών αντί για δήλωση διαθεσιμότητας.
--
-- Το `stelexos_availability` υλοποιούσε πρόσκληση: κάθε στέλεχος δήλωνε μόνο
-- του «ναι / ίσως / όχι», και όποιος δεν απαντούσε έμενε `ANAPANTITO`. Στην
-- πράξη τα στελέχη ενός κλάδου είναι δύο ή τρία και συνεννοούνται πριν καν
-- ανοίξει η εφαρμογή — η πρόσκληση ήταν ένα βήμα που κανείς δεν έκανε.
--
-- Μένει μια σκέτη σχέση: ποια στελέχη αναλαμβάνουν τη συγκέντρωση, όπως τα
-- διαλέγει ο σχεδιαστής. Οι παλιές δηλώσεις «διαθέσιμος» γίνονται επιλογές·
-- τα «όχι», τα «ίσως» και οι σιωπές δεν αντιστοιχούν σε επιλογή και χάνονται.

CREATE TABLE "syggentrwsh_stelexos" (
    "syggentrwshId" UUID NOT NULL,
    "userId"        UUID NOT NULL,

    CONSTRAINT "syggentrwsh_stelexos_pkey" PRIMARY KEY ("syggentrwshId", "userId")
);

INSERT INTO "syggentrwsh_stelexos" ("syggentrwshId", "userId")
SELECT "syggentrwshId", "userId"
FROM "stelexos_availability"
WHERE "status" = 'DIATHESIMOS';

ALTER TABLE "syggentrwsh_stelexos"
  ADD CONSTRAINT "syggentrwsh_stelexos_syggentrwshId_fkey"
  FOREIGN KEY ("syggentrwshId") REFERENCES "syggentrwsh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "syggentrwsh_stelexos"
  ADD CONSTRAINT "syggentrwsh_stelexos_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "stelexos_availability";
DROP TYPE "Availability";
