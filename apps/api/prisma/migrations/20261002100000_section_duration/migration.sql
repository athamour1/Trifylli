-- Διάρκεια ανά μέρος της συγκέντρωσης.
--
-- Τα κομμάτια έμειναν εκεί που χρειάζονται, στο Κύριο Μέρος. Το Άνοιγμα και το
-- Κλείσιμο είναι τελετουργικά — έπαρση, τραγούδι, υποστολή — και δεν σπάνε σε
-- κομμάτια με υπεύθυνο και υλικό· θέλουν όμως χρόνο, αλλιώς το χρονοδιάγραμμα
-- ξεκινά από το πουθενά.
--
-- Ο πίνακας κρατά πλέον και διάρκεια, οπότε «σημείωση» δεν τον περιγράφει.

ALTER TABLE "syggentrwsh_section_note" RENAME TO "syggentrwsh_section";
ALTER TABLE "syggentrwsh_section" RENAME CONSTRAINT "syggentrwsh_section_note_pkey" TO "syggentrwsh_section_pkey";
ALTER TABLE "syggentrwsh_section"
  RENAME CONSTRAINT "syggentrwsh_section_note_syggentrwshId_fkey" TO "syggentrwsh_section_syggentrwshId_fkey";

ALTER TABLE "syggentrwsh_section" ADD COLUMN "durationMin" INTEGER NOT NULL DEFAULT 0;
