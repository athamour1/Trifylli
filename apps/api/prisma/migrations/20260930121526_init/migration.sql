-- CreateEnum
CREATE TYPE "KladosType" AS ENUM ('ASTERIA', 'POULIA', 'ODIGOI', 'MEGALOI_ODIGOI', 'NAFTODIGOI');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MELOS', 'STELEXOS', 'YPEFTHINOS_KLADOU', 'TOPIKOS_EFOROS', 'ADMIN_TOPIKOU');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ENERGO', 'ANENERGO', 'APOCHOROISE');

-- CreateEnum
CREATE TYPE "YlikoCategory" AS ENUM ('LEITOURGIKO', 'PROGRAMMATIKO', 'FARMAKEIO');

-- CreateEnum
CREATE TYPE "DrasiType" AS ENUM ('MONOIMERI', 'POLYIMERI', 'KATASKINOSI');

-- CreateEnum
CREATE TYPE "SymvoulioType" AS ENUM ('OMADAS', 'YPEFTHINON', 'ENOMOTIAS', 'TOPIKOU', 'STELEXON');

-- CreateEnum
CREATE TYPE "ParousiaStatus" AS ENUM ('PAROUSIA', 'APOUSIA', 'DIKAIOLOGIMENI', 'ARGOPORIA');

-- CreateEnum
CREATE TYPE "TimelineSection" AS ENUM ('ANOIGMA', 'KYRIO_MEROS', 'KLEISIMO');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('DIATHESIMOS', 'MI_DIATHESIMOS', 'ISOS', 'ANAPANTITO');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('DESMEFSI', 'PARALAVI', 'EPISTROFI', 'AKYROSI');

-- CreateEnum
CREATE TYPE "SyndromiStatus" AS ENUM ('PLIROMENI', 'MERIKI', 'EKKREMI', 'APALLAGI');

-- CreateEnum
CREATE TYPE "ProodosStatus" AS ENUM ('DEN_XEKINISE', 'SE_EXELIXI', 'OLOKLIROMENO');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('LOCAL', 'ESEO', 'OUCHTRACKER');

-- CreateTable
CREATE TABLE "topiko" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "eseoCode" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Athens',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topiko_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "klados" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "type" "KladosType" NOT NULL,
    "name" TEXT,
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "klados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "ssoId" TEXT,
    "eseoId" TEXT,
    "email" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "birthDate" DATE,
    "role" "Role" NOT NULL DEFAULT 'MELOS',
    "status" "MemberStatus" NOT NULL DEFAULT 'ENERGO',
    "source" "DataSource" NOT NULL DEFAULT 'LOCAL',
    "eseoPayload" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kladosId" UUID NOT NULL,
    "subUnit" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MELOS',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "syndromiAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndromi" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "amountDue" DECIMAL(10,2) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "SyndromiStatus" NOT NULL DEFAULT 'EKKREMI',
    "note" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'LOCAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndromi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "syndromiId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "receiptNo" TEXT,
    "note" TEXT,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "kladosId" UUID,
    "title" TEXT NOT NULL,
    "type" "DrasiType" NOT NULL,
    "location" TEXT,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "dateEnd" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "costPerPerson" DECIMAL(10,2),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drasi_participant" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MELOS',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "attended" BOOLEAN,
    "note" TEXT,

    CONSTRAINT "drasi_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syggentrwsh" (
    "id" UUID NOT NULL,
    "kladosId" UUID NOT NULL,
    "drasiId" UUID,
    "title" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "location" TEXT,
    "goal" TEXT,
    "review" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syggentrwsh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_block" (
    "id" UUID NOT NULL,
    "syggentrwshId" UUID NOT NULL,
    "section" "TimelineSection" NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 15,
    "responsibleId" UUID,

    CONSTRAINT "timeline_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_block_yliko" (
    "blockId" UUID NOT NULL,
    "ylikoId" UUID NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "timeline_block_yliko_pkey" PRIMARY KEY ("blockId","ylikoId")
);

-- CreateTable
CREATE TABLE "stelexos_availability" (
    "id" UUID NOT NULL,
    "syggentrwshId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "Availability" NOT NULL DEFAULT 'ANAPANTITO',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stelexos_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parousia" (
    "id" UUID NOT NULL,
    "syggentrwshId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ParousiaStatus" NOT NULL,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parousia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proodos_goal" (
    "id" UUID NOT NULL,
    "kladosId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "proodos_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proodos_record" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "periodId" UUID,
    "status" "ProodosStatus" NOT NULL DEFAULT 'DEN_XEKINISE',
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proodos_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symvoulio" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "kladosId" UUID,
    "type" "SymvoulioType" NOT NULL,
    "title" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "chairId" UUID,
    "notes" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "symvoulio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_item" (
    "id" UUID NOT NULL,
    "symvoulioId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "minutes" TEXT,
    "decision" TEXT,
    "responsibleId" UUID,
    "dueDate" DATE,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "agenda_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yliko" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "kladosId" UUID,
    "name" TEXT NOT NULL,
    "category" "YlikoCategory" NOT NULL,
    "totalQty" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "storageLocation" TEXT,
    "consumable" BOOLEAN NOT NULL DEFAULT false,
    "minQty" INTEGER,
    "expiresAt" DATE,
    "notes" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'LOCAL',
    "externalId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yliko_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yliko_checkout" (
    "id" UUID NOT NULL,
    "ylikoId" UUID NOT NULL,
    "kladosId" UUID,
    "drasiId" UUID,
    "syggentrwshId" UUID,
    "requestedById" UUID,
    "qty" INTEGER NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'DESMEFSI',
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "returnedQty" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yliko_checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "drasiId" UUID,
    "patientId" UUID,
    "externalId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "treatment" TEXT,
    "severity" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "source" "DataSource" NOT NULL DEFAULT 'OUCHTRACKER',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "source" "DataSource" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "cursor" TEXT,

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "topikoId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topiko_eseoCode_key" ON "topiko"("eseoCode");

-- CreateIndex
CREATE UNIQUE INDEX "klados_topikoId_type_key" ON "klados"("topikoId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "user_ssoId_key" ON "user"("ssoId");

-- CreateIndex
CREATE UNIQUE INDEX "user_eseoId_key" ON "user"("eseoId");

-- CreateIndex
CREATE INDEX "user_topikoId_status_idx" ON "user"("topikoId", "status");

-- CreateIndex
CREATE INDEX "user_topikoId_lastName_firstName_idx" ON "user"("topikoId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "membership_kladosId_leftAt_idx" ON "membership"("kladosId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_userId_kladosId_key" ON "membership"("userId", "kladosId");

-- CreateIndex
CREATE INDEX "period_topikoId_isCurrent_idx" ON "period"("topikoId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "period_topikoId_label_key" ON "period"("topikoId", "label");

-- CreateIndex
CREATE INDEX "syndromi_periodId_status_idx" ON "syndromi"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "syndromi_userId_periodId_key" ON "syndromi"("userId", "periodId");

-- CreateIndex
CREATE INDEX "payment_syndromiId_paidAt_idx" ON "payment"("syndromiId", "paidAt");

-- CreateIndex
CREATE INDEX "drasi_topikoId_dateStart_idx" ON "drasi"("topikoId", "dateStart");

-- CreateIndex
CREATE INDEX "drasi_kladosId_dateStart_idx" ON "drasi"("kladosId", "dateStart");

-- CreateIndex
CREATE INDEX "drasi_participant_drasiId_role_idx" ON "drasi_participant"("drasiId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "drasi_participant_drasiId_userId_key" ON "drasi_participant"("drasiId", "userId");

-- CreateIndex
CREATE INDEX "syggentrwsh_kladosId_date_idx" ON "syggentrwsh"("kladosId", "date");

-- CreateIndex
CREATE INDEX "syggentrwsh_drasiId_idx" ON "syggentrwsh"("drasiId");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_block_syggentrwshId_section_order_key" ON "timeline_block"("syggentrwshId", "section", "order");

-- CreateIndex
CREATE UNIQUE INDEX "stelexos_availability_syggentrwshId_userId_key" ON "stelexos_availability"("syggentrwshId", "userId");

-- CreateIndex
CREATE INDEX "parousia_userId_recordedAt_idx" ON "parousia"("userId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "parousia_syggentrwshId_userId_key" ON "parousia"("syggentrwshId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "proodos_goal_kladosId_code_key" ON "proodos_goal"("kladosId", "code");

-- CreateIndex
CREATE INDEX "proodos_record_goalId_status_idx" ON "proodos_record"("goalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "proodos_record_userId_goalId_key" ON "proodos_record"("userId", "goalId");

-- CreateIndex
CREATE INDEX "symvoulio_topikoId_date_idx" ON "symvoulio"("topikoId", "date");

-- CreateIndex
CREATE INDEX "symvoulio_kladosId_date_idx" ON "symvoulio"("kladosId", "date");

-- CreateIndex
CREATE INDEX "agenda_item_responsibleId_doneAt_idx" ON "agenda_item"("responsibleId", "doneAt");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_item_symvoulioId_order_key" ON "agenda_item"("symvoulioId", "order");

-- CreateIndex
CREATE INDEX "yliko_topikoId_category_idx" ON "yliko"("topikoId", "category");

-- CreateIndex
CREATE INDEX "yliko_kladosId_category_idx" ON "yliko"("kladosId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "yliko_topikoId_externalId_key" ON "yliko"("topikoId", "externalId");

-- CreateIndex
CREATE INDEX "yliko_checkout_ylikoId_status_from_to_idx" ON "yliko_checkout"("ylikoId", "status", "from", "to");

-- CreateIndex
CREATE INDEX "yliko_checkout_drasiId_idx" ON "yliko_checkout"("drasiId");

-- CreateIndex
CREATE INDEX "yliko_checkout_syggentrwshId_idx" ON "yliko_checkout"("syggentrwshId");

-- CreateIndex
CREATE INDEX "incident_topikoId_occurredAt_idx" ON "incident"("topikoId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "incident_topikoId_externalId_key" ON "incident"("topikoId", "externalId");

-- CreateIndex
CREATE INDEX "sync_run_topikoId_source_startedAt_idx" ON "sync_run"("topikoId", "source", "startedAt");

-- CreateIndex
CREATE INDEX "audit_log_topikoId_createdAt_idx" ON "audit_log"("topikoId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "klados" ADD CONSTRAINT "klados_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period" ADD CONSTRAINT "period_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndromi" ADD CONSTRAINT "syndromi_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndromi" ADD CONSTRAINT "syndromi_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "period"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_syndromiId_fkey" FOREIGN KEY ("syndromiId") REFERENCES "syndromi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi" ADD CONSTRAINT "drasi_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi" ADD CONSTRAINT "drasi_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_participant" ADD CONSTRAINT "drasi_participant_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drasi_participant" ADD CONSTRAINT "drasi_participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syggentrwsh" ADD CONSTRAINT "syggentrwsh_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syggentrwsh" ADD CONSTRAINT "syggentrwsh_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_block" ADD CONSTRAINT "timeline_block_syggentrwshId_fkey" FOREIGN KEY ("syggentrwshId") REFERENCES "syggentrwsh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_block" ADD CONSTRAINT "timeline_block_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_block_yliko" ADD CONSTRAINT "timeline_block_yliko_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "timeline_block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_block_yliko" ADD CONSTRAINT "timeline_block_yliko_ylikoId_fkey" FOREIGN KEY ("ylikoId") REFERENCES "yliko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stelexos_availability" ADD CONSTRAINT "stelexos_availability_syggentrwshId_fkey" FOREIGN KEY ("syggentrwshId") REFERENCES "syggentrwsh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stelexos_availability" ADD CONSTRAINT "stelexos_availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parousia" ADD CONSTRAINT "parousia_syggentrwshId_fkey" FOREIGN KEY ("syggentrwshId") REFERENCES "syggentrwsh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parousia" ADD CONSTRAINT "parousia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proodos_goal" ADD CONSTRAINT "proodos_goal_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proodos_record" ADD CONSTRAINT "proodos_record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proodos_record" ADD CONSTRAINT "proodos_record_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "proodos_goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proodos_record" ADD CONSTRAINT "proodos_record_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symvoulio" ADD CONSTRAINT "symvoulio_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symvoulio" ADD CONSTRAINT "symvoulio_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symvoulio" ADD CONSTRAINT "symvoulio_chairId_fkey" FOREIGN KEY ("chairId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_symvoulioId_fkey" FOREIGN KEY ("symvoulioId") REFERENCES "symvoulio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yliko" ADD CONSTRAINT "yliko_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yliko" ADD CONSTRAINT "yliko_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yliko_checkout" ADD CONSTRAINT "yliko_checkout_ylikoId_fkey" FOREIGN KEY ("ylikoId") REFERENCES "yliko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yliko_checkout" ADD CONSTRAINT "yliko_checkout_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yliko_checkout" ADD CONSTRAINT "yliko_checkout_syggentrwshId_fkey" FOREIGN KEY ("syggentrwshId") REFERENCES "syggentrwsh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yliko_checkout" ADD CONSTRAINT "yliko_checkout_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_topikoId_fkey" FOREIGN KEY ("topikoId") REFERENCES "topiko"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
