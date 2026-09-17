-- AlterTable
ALTER TABLE "user" ADD COLUMN     "area" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "sex" TEXT,
ADD COLUMN     "street" TEXT;

-- CreateTable
CREATE TABLE "guardian" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eseoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fullName" TEXT,
    "phone" TEXT,
    "email" TEXT,

    CONSTRAINT "guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eseoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startDate" DATE,
    "expirationDate" DATE,
    "source" "DataSource" NOT NULL DEFAULT 'ESEO',
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "license_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardian_eseoId_key" ON "guardian"("eseoId");

-- CreateIndex
CREATE INDEX "guardian_userId_idx" ON "guardian"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "license_eseoId_key" ON "license"("eseoId");

-- CreateIndex
CREATE INDEX "license_userId_status_idx" ON "license"("userId", "status");

-- AddForeignKey
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license" ADD CONSTRAINT "license_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
