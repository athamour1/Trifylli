-- Σχεδιασμός συγκέντρωσης: σημειώσεις ανά μέρος και ελεύθερη λίστα υλικού.
--
-- Το χρονοδιάγραμμα (`timeline_block`) κάλυπτε μόνο τα κομμάτια με τη διάρκειά
-- τους. Λείπαν δύο πράγματα που κρατούσαν τα στελέχη σε χαρτί:
--
--  * ελεύθερο κείμενο ανά μέρος (Άνοιγμα / Κύριο Μέρος / Κλείσιμο) — τραγούδια,
--    οδηγίες, ό,τι δεν χωράει σε τίτλο κομματιού·
--  * μια λίστα «τι να πάρουμε μαζί», ασύνδετη από την αποθήκη, γιατί τα μισά
--    πράγματα που χρειάζεται μια συγκέντρωση δεν είναι καταγεγραμμένο υλικό.

CREATE TABLE "syggentrwsh_section_note" (
    "syggentrwshId" UUID NOT NULL,
    "section"       "TimelineSection" NOT NULL,
    "notes"         TEXT NOT NULL DEFAULT '',
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syggentrwsh_section_note_pkey" PRIMARY KEY ("syggentrwshId", "section")
);

ALTER TABLE "syggentrwsh_section_note"
  ADD CONSTRAINT "syggentrwsh_section_note_syggentrwshId_fkey"
  FOREIGN KEY ("syggentrwshId") REFERENCES "syggentrwsh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "syggentrwsh_yliko_item" (
    "id"            UUID NOT NULL,
    "syggentrwshId" UUID NOT NULL,
    "order"         INTEGER NOT NULL,
    "label"         TEXT NOT NULL,
    "qty"           INTEGER NOT NULL DEFAULT 1,
    "packed"        BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "syggentrwsh_yliko_item_pkey" PRIMARY KEY ("id")
);

-- Χωρίς unique στο ("syggentrwshId", "order"): η λίστα αντικαθίσταται ολόκληρη
-- σε κάθε αποθήκευση, οπότε η αναδιάταξη δεν περνά από ενδιάμεση κατάσταση με
-- διπλά `order` που θα έσπαγε έναν τέτοιο περιορισμό.
CREATE INDEX "syggentrwsh_yliko_item_syggentrwshId_order_idx"
  ON "syggentrwsh_yliko_item"("syggentrwshId", "order");

ALTER TABLE "syggentrwsh_yliko_item"
  ADD CONSTRAINT "syggentrwsh_yliko_item_syggentrwshId_fkey"
  FOREIGN KEY ("syggentrwshId") REFERENCES "syggentrwsh"("id") ON DELETE CASCADE ON UPDATE CASCADE;
