-- CreateTable
CREATE TABLE "BlackMarketScanSnapshot" (
    "id" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlackMarketScanSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlackMarketScanSnapshot_cachedAt_idx" ON "BlackMarketScanSnapshot"("cachedAt");

-- RenameIndex
ALTER INDEX "MarketPriceObservation_server_itemId_city_quality_orderType_obs" RENAME TO "MarketPriceObservation_server_itemId_city_quality_orderType_idx";

-- RenameIndex
ALTER INDEX "MarketPriceObservation_userId_server_itemId_city_quality_orderT" RENAME TO "MarketPriceObservation_userId_server_itemId_city_quality_or_idx";
