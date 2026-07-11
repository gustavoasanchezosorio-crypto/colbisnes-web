-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifyToken" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifyTokenExpiry" TIMESTAMP(3);
