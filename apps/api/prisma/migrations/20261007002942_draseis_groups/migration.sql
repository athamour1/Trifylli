-- CreateEnum
CREATE TYPE "DrasiGroupKind" AS ENUM ('PENTADA', 'FOLIA', 'ENOMOTIA', 'SKINI', 'ALLO');

-- CreateTable
CREATE TABLE "drasi_group" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "kind" "DrasiGroupKind" NOT NULL,
    "name" TEXT NOT NULL,
    "kladosId" UUID,
    "leaderParticipantId" UUID,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drasi_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_group_member" (
    "groupId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "kind" "DrasiGroupKind" NOT NULL,

    CONSTRAINT "drasi_group_member_pkey" PRIMARY KEY ("groupId","participantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "drasi_group_drasiId_kind_name_key" ON "drasi_group"("drasiId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "drasi_group_member_participantId_kind_key" ON "drasi_group_member"("participantId", "kind");

-- AddForeignKey
ALTER TABLE "drasi_group" ADD CONSTRAINT "drasi_group_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_group" ADD CONSTRAINT "drasi_group_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_group" ADD CONSTRAINT "drasi_group_leaderParticipantId_fkey" FOREIGN KEY ("leaderParticipantId") REFERENCES "drasi_participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_group_member" ADD CONSTRAINT "drasi_group_member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "drasi_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_group_member" ADD CONSTRAINT "drasi_group_member_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "drasi_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
