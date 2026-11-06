-- Προγραμματικά εκτός ωρολογίου («έξτρα») στο kanban «Προγραμματικά».
CREATE TABLE "drasi_extra_item" (
    "id" UUID NOT NULL,
    "drasiId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "DrasiScheduleKind" NOT NULL DEFAULT 'DRASTIRIOTITA',
    "status" "DrasiScheduleStatus" NOT NULL DEFAULT 'TODO',
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "location" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drasi_extra_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drasi_extra_assignee" (
    "extraId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "drasi_extra_assignee_pkey" PRIMARY KEY ("extraId","userId")
);

CREATE TABLE "drasi_extra_yliko_item" (
    "id" UUID NOT NULL,
    "extraId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "packedById" UUID,
    "packedAt" TIMESTAMP(3),

    CONSTRAINT "drasi_extra_yliko_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "drasi_extra_item_drasiId_createdAt_idx" ON "drasi_extra_item"("drasiId", "createdAt");
CREATE INDEX "drasi_extra_assignee_userId_idx" ON "drasi_extra_assignee"("userId");
CREATE INDEX "drasi_extra_yliko_item_extraId_order_idx" ON "drasi_extra_yliko_item"("extraId", "order");

ALTER TABLE "drasi_extra_item" ADD CONSTRAINT "drasi_extra_item_drasiId_fkey" FOREIGN KEY ("drasiId") REFERENCES "drasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drasi_extra_assignee" ADD CONSTRAINT "drasi_extra_assignee_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "drasi_extra_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drasi_extra_assignee" ADD CONSTRAINT "drasi_extra_assignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drasi_extra_yliko_item" ADD CONSTRAINT "drasi_extra_yliko_item_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "drasi_extra_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
