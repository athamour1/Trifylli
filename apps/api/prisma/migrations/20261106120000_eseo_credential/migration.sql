-- Σύνδεση στο e-SEO από τις Ενσωματώσεις: όνομα + κωδικός (κρυπτογραφημένα).
CREATE TABLE "eseo_credential" (
    "id" TEXT NOT NULL DEFAULT 'eseo',
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "refreshToken" TEXT,
    "loggedInAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eseo_credential_pkey" PRIMARY KEY ("id")
);
