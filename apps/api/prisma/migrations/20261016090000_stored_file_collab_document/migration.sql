-- Εικόνες Markdown δεμένες με κοινό έγγραφο της συνεργασίας: τις βλέπει όποιος
-- βλέπει το έγγραφο (και τα εξωτερικά στελέχη), και η σάρωση δεν τις σβήνει όσο
-- το έγγραφο ζει.

-- AlterTable
ALTER TABLE "stored_file" ADD COLUMN     "collabDocument" TEXT;

-- CreateIndex
CREATE INDEX "stored_file_collabDocument_idx" ON "stored_file"("collabDocument");
