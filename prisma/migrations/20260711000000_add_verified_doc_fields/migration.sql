-- Datos verificados por Didit, necesarios para dispersión de fondos (Wompi Payouts)
ALTER TABLE "User" ADD COLUMN "docType" TEXT;
ALTER TABLE "User" ADD COLUMN "docNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "verifiedName" TEXT;
