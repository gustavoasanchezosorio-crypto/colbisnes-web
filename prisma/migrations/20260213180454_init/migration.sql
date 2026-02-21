-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCOP" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "acceptedOfferId" TEXT,
    "paymentExpiresAt" DATETIME,
    "paidAt" DATETIME,
    "soldAt" DATETIME
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "amountCOP" INTEGER NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Offer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Offer_productId_idx" ON "Offer"("productId");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");
