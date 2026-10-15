-- Συνεργασία σε πραγματικό χρόνο: τα κοινά έγγραφα Yjs (βλ. docs/synergasia.md).
-- Η απλή τιμή κάθε πεδίου γράφεται και στην οντότητα σε κάθε αποθήκευση.

-- CreateTable
CREATE TABLE "collab_document" (
    "name" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "generation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collab_document_pkey" PRIMARY KEY ("name")
);
