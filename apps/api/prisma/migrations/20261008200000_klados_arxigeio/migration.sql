
-- CreateEnum
CREATE TYPE "KladosDuty" AS ENUM ('TAMIAS', 'GRAMMATEAS', 'FARMAKEIO', 'FOTOGRAFIA', 'ENIMEROSI', 'SOCIAL_MEDIA');

-- CreateTable
CREATE TABLE "klados_responsibility" (
    "id" UUID NOT NULL,
    "kladosId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "duty" "KladosDuty" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "klados_responsibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "klados_responsibility_kladosId_duty_idx" ON "klados_responsibility"("kladosId", "duty");

-- CreateIndex
CREATE UNIQUE INDEX "klados_responsibility_kladosId_userId_duty_key" ON "klados_responsibility"("kladosId", "userId", "duty");

-- AddForeignKey
ALTER TABLE "klados_responsibility" ADD CONSTRAINT "klados_responsibility_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "klados_responsibility" ADD CONSTRAINT "klados_responsibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

