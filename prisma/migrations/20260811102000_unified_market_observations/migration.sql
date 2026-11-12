-- CreateEnum
CREATE TYPE "MarketObservationSource" AS ENUM (
  'LIVE_PUBLIC',
  'LAST_KNOWN_PUBLIC',
  'HISTORICAL_PUBLIC',
  'PRIVATE_MANUAL',
  'PRIVATE_IMPORT',
  'PRIVATE_API',
  'CALCULATED'
);

-- CreateEnum
CREATE TYPE "MarketObservationConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "MarketPriceObservation" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "server" "AlbionServer" NOT NULL,
  "itemId" TEXT NOT NULL,
  "city" "AlbionCity" NOT NULL,
  "quality" INTEGER NOT NULL,
  "orderType" "MarketOrderType" NOT NULL,
  "price" BIGINT,
  "availableQuantity" INTEGER,
  "observedAt" TIMESTAMP(3),
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "source" "MarketObservationSource" NOT NULL,
  "confidence" "MarketObservationConfidence" NOT NULL,
  "sourceReference" TEXT,
  "metadataJson" JSONB,

  CONSTRAINT "MarketPriceObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketPriceObservation_quality_check" CHECK ("quality" BETWEEN 1 AND 5),
  CONSTRAINT "MarketPriceObservation_price_check" CHECK ("price" IS NULL OR "price" > 0),
  CONSTRAINT "MarketPriceObservation_quantity_check" CHECK ("availableQuantity" IS NULL OR "availableQuantity" > 0),
  CONSTRAINT "MarketPriceObservation_expiry_check" CHECK ("expiresAt" IS NULL OR "expiresAt" > "collectedAt")
);

-- CreateIndex
CREATE INDEX "MarketPriceObservation_server_itemId_city_quality_orderType_observedAt_idx"
ON "MarketPriceObservation"("server", "itemId", "city", "quality", "orderType", "observedAt");

-- CreateIndex
CREATE INDEX "MarketPriceObservation_userId_server_itemId_city_quality_orderType_observedAt_idx"
ON "MarketPriceObservation"("userId", "server", "itemId", "city", "quality", "orderType", "observedAt");

-- CreateIndex
CREATE INDEX "MarketPriceObservation_source_collectedAt_idx"
ON "MarketPriceObservation"("source", "collectedAt");

-- CreateIndex
CREATE INDEX "MarketPriceObservation_expiresAt_idx"
ON "MarketPriceObservation"("expiresAt");

-- AddForeignKey
ALTER TABLE "MarketPriceObservation"
ADD CONSTRAINT "MarketPriceObservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPriceObservation"
ADD CONSTRAINT "MarketPriceObservation_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
