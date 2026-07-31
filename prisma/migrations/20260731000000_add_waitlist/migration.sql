-- Lista de espera del prelanzamiento (formulario de /coming-soon).
--
-- Migracion puramente aditiva: solo CREATE, ningun ALTER ni DROP sobre tablas
-- existentes. Se genero con `prisma migrate diff --from-schema-datasource`
-- (solo lectura contra la base) en vez de `prisma migrate dev`, porque en este
-- proyecto DATABASE_URL apunta a PRODUCCION y `migrate dev` puede resetear la
-- base si detecta drift. Para aplicarla se usa `prisma migrate deploy`, que
-- nunca resetea.
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_email_key" ON "Waitlist"("email");

-- CreateIndex
CREATE INDEX "Waitlist_createdAt_idx" ON "Waitlist"("createdAt");
