-- CreateTable
CREATE TABLE "proodos_entry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "passedAt" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proodos_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proodos_entry_userId_kind_idx" ON "proodos_entry"("userId", "kind");

-- AddForeignKey
ALTER TABLE "proodos_entry" ADD CONSTRAINT "proodos_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
