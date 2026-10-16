-- CreateTable
CREATE TABLE "symvoulio_poll" (
    "id" UUID NOT NULL,
    "symvoulioId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "symvoulio_poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symvoulio_poll_vote" (
    "pollId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "choice" INTEGER,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "symvoulio_poll_vote_pkey" PRIMARY KEY ("pollId","userId")
);

-- CreateTable
CREATE TABLE "symvoulio_poll_ballot" (
    "id" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "choice" INTEGER NOT NULL,

    CONSTRAINT "symvoulio_poll_ballot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "symvoulio_poll_symvoulioId_createdAt_idx" ON "symvoulio_poll"("symvoulioId", "createdAt");

-- CreateIndex
CREATE INDEX "symvoulio_poll_ballot_pollId_idx" ON "symvoulio_poll_ballot"("pollId");

-- AddForeignKey
ALTER TABLE "symvoulio_poll" ADD CONSTRAINT "symvoulio_poll_symvoulioId_fkey" FOREIGN KEY ("symvoulioId") REFERENCES "symvoulio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symvoulio_poll" ADD CONSTRAINT "symvoulio_poll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symvoulio_poll_vote" ADD CONSTRAINT "symvoulio_poll_vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "symvoulio_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symvoulio_poll_vote" ADD CONSTRAINT "symvoulio_poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symvoulio_poll_ballot" ADD CONSTRAINT "symvoulio_poll_ballot_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "symvoulio_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

