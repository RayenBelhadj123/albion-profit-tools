-- CreateEnum
CREATE TYPE "AlbionServer" AS ENUM ('EUROPE', 'AMERICAS', 'ASIA');

-- CreateEnum
CREATE TYPE "AlbionCity" AS ENUM ('BRIDGEWATCH', 'CAERLEON', 'FORT_STERLING', 'LYMHURST', 'MARTLOCK', 'THETFORD');

-- CreateEnum
CREATE TYPE "MarketOrderType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "PrivateObservationSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'PRIVATE_API');

-- CreateEnum
CREATE TYPE "SelectedPriceSource" AS ENUM ('PUBLIC', 'PRIVATE_MANUAL', 'PRIVATE_IMPORT', 'CALCULATED');

-- CreateEnum
CREATE TYPE "TransportStrategy" AS ENUM ('INSTANT_SELL', 'SELL_ORDER');

-- CreateEnum
CREATE TYPE "TransportPlanStatus" AS ENUM ('DRAFT', 'SAVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CraftPlanStatus" AS ENUM ('DRAFT', 'SAVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CraftLocationType" AS ENUM ('CITY', 'HIDEOUT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "tier" INTEGER,
    "enchantment" INTEGER NOT NULL DEFAULT 0,
    "weightGrams" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPriceCache" (
    "id" TEXT NOT NULL,
    "server" "AlbionServer" NOT NULL,
    "itemId" TEXT NOT NULL,
    "city" "AlbionCity" NOT NULL,
    "quality" INTEGER NOT NULL,
    "sellPriceMin" BIGINT,
    "sellPriceMinDate" TIMESTAMP(3),
    "sellPriceMinQuantity" INTEGER,
    "buyPriceMax" BIGINT,
    "buyPriceMaxDate" TIMESTAMP(3),
    "buyPriceMaxQuantity" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPriceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateMarketObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "server" "AlbionServer" NOT NULL,
    "itemId" TEXT NOT NULL,
    "city" "AlbionCity" NOT NULL,
    "quality" INTEGER NOT NULL,
    "orderType" "MarketOrderType" NOT NULL,
    "price" BIGINT NOT NULL,
    "availableQuantity" INTEGER,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "source" "PrivateObservationSource" NOT NULL DEFAULT 'MANUAL',
    "preferredOverride" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateMarketObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "server" "AlbionServer" NOT NULL,
    "sourceCity" "AlbionCity" NOT NULL,
    "destinationCity" "AlbionCity" NOT NULL,
    "durationMinutes" INTEGER,
    "riskLevel" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultServer" "AlbionServer" NOT NULL DEFAULT 'EUROPE',
    "availableSilver" BIGINT,
    "carryingCapacityGrams" INTEGER,
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 650,
    "setupFeeSilver" BIGINT NOT NULL DEFAULT 0,
    "maxDataAgeMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "routeId" TEXT,
    "profileId" TEXT,
    "server" "AlbionServer" NOT NULL,
    "sourceCity" "AlbionCity" NOT NULL,
    "destinationCity" "AlbionCity" NOT NULL,
    "status" "TransportPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "strategy" "TransportStrategy" NOT NULL DEFAULT 'INSTANT_SELL',
    "availableSilver" BIGINT NOT NULL,
    "carryingCapacityGrams" INTEGER NOT NULL,
    "expectedInvestment" BIGINT NOT NULL DEFAULT 0,
    "expectedGrossRevenue" BIGINT NOT NULL DEFAULT 0,
    "expectedTaxes" BIGINT NOT NULL DEFAULT 0,
    "expectedSetupFees" BIGINT NOT NULL DEFAULT 0,
    "expectedNetProfit" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purchasePrice" BIGINT NOT NULL,
    "expectedSalePrice" BIGINT NOT NULL,
    "purchasePriceSource" "SelectedPriceSource" NOT NULL,
    "salePriceSource" "SelectedPriceSource" NOT NULL,
    "purchaseObservedAt" TIMESTAMP(3),
    "saleObservedAt" TIMESTAMP(3),
    "availableQuantity" INTEGER,
    "itemWeightGrams" INTEGER,
    "totalWeightGrams" INTEGER,
    "expectedInvestment" BIGINT NOT NULL,
    "expectedGrossRevenue" BIGINT NOT NULL,
    "expectedTaxes" BIGINT NOT NULL,
    "expectedSetupFees" BIGINT NOT NULL DEFAULT 0,
    "expectedNetProfit" BIGINT NOT NULL,
    "roiBasisPoints" INTEGER,
    "profitPerKgSilver" INTEGER,
    "warningsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletedTrip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "routeId" TEXT,
    "server" "AlbionServer" NOT NULL,
    "sourceCity" "AlbionCity" NOT NULL,
    "destinationCity" "AlbionCity" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualInvestment" BIGINT NOT NULL DEFAULT 0,
    "actualGrossRevenue" BIGINT NOT NULL DEFAULT 0,
    "actualTaxes" BIGINT NOT NULL DEFAULT 0,
    "actualSetupFees" BIGINT NOT NULL DEFAULT 0,
    "actualNetProfit" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompletedTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletedTripItem" (
    "id" TEXT NOT NULL,
    "completedTripId" TEXT NOT NULL,
    "planItemId" TEXT,
    "itemId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "actualPurchasePrice" BIGINT NOT NULL,
    "actualSalePrice" BIGINT NOT NULL,
    "actualInvestment" BIGINT NOT NULL,
    "actualGrossRevenue" BIGINT NOT NULL,
    "actualTaxes" BIGINT NOT NULL DEFAULT 0,
    "actualSetupFees" BIGINT NOT NULL DEFAULT 0,
    "actualNetProfit" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletedTripItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraftRecipe" (
    "id" TEXT NOT NULL,
    "outputItemId" TEXT NOT NULL,
    "outputQuantity" INTEGER NOT NULL DEFAULT 1,
    "nutritionRequired" INTEGER,
    "baseFocusCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CraftRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraftRecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "receivesReturn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CraftRecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraftProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultServer" "AlbionServer" NOT NULL DEFAULT 'EUROPE',
    "materialCity" "AlbionCity",
    "craftCity" "AlbionCity",
    "sellCity" "AlbionCity",
    "craftLocationType" "CraftLocationType" NOT NULL DEFAULT 'CITY',
    "resourceReturnRateBasisPoints" INTEGER NOT NULL DEFAULT 1870,
    "focusReturnRateBasisPoints" INTEGER,
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 650,
    "setupFeeSilver" BIGINT NOT NULL DEFAULT 0,
    "stationFeePer100Nutrition" BIGINT NOT NULL DEFAULT 0,
    "maxDataAgeMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CraftProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraftPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "server" "AlbionServer" NOT NULL,
    "materialCity" "AlbionCity" NOT NULL,
    "craftCity" "AlbionCity" NOT NULL,
    "sellCity" "AlbionCity" NOT NULL,
    "craftLocationType" "CraftLocationType" NOT NULL DEFAULT 'CITY',
    "status" "CraftPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "useFocus" BOOLEAN NOT NULL DEFAULT false,
    "resourceReturnRateBasisPoints" INTEGER NOT NULL,
    "focusCost" INTEGER,
    "taxRateBasisPoints" INTEGER NOT NULL,
    "setupFeeSilver" BIGINT NOT NULL DEFAULT 0,
    "stationFeePer100Nutrition" BIGINT NOT NULL DEFAULT 0,
    "expectedMaterialCost" BIGINT NOT NULL DEFAULT 0,
    "expectedReturnValue" BIGINT NOT NULL DEFAULT 0,
    "expectedStationFee" BIGINT NOT NULL DEFAULT 0,
    "expectedGrossRevenue" BIGINT NOT NULL DEFAULT 0,
    "expectedTaxes" BIGINT NOT NULL DEFAULT 0,
    "expectedNetProfit" BIGINT NOT NULL DEFAULT 0,
    "profitPerFocus" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CraftPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraftPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "recipeId" TEXT,
    "outputItemId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL,
    "outputQuantity" INTEGER NOT NULL,
    "outputUnitPrice" BIGINT NOT NULL,
    "outputPriceSource" "SelectedPriceSource" NOT NULL,
    "outputObservedAt" TIMESTAMP(3),
    "materialCost" BIGINT NOT NULL,
    "returnValue" BIGINT NOT NULL DEFAULT 0,
    "stationFee" BIGINT NOT NULL DEFAULT 0,
    "grossRevenue" BIGINT NOT NULL,
    "taxes" BIGINT NOT NULL DEFAULT 0,
    "setupFees" BIGINT NOT NULL DEFAULT 0,
    "netProfit" BIGINT NOT NULL,
    "roiBasisPoints" INTEGER,
    "focusCost" INTEGER,
    "profitPerFocus" INTEGER,
    "inputWeightGrams" INTEGER,
    "outputWeightGrams" INTEGER,
    "warningsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CraftPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CraftPlanIngredient" (
    "id" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityRequired" INTEGER NOT NULL,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "netQuantityConsumed" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "priceSource" "SelectedPriceSource" NOT NULL,
    "observedAt" TIMESTAMP(3),
    "totalCost" BIGINT NOT NULL,
    "returnValue" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CraftPlanIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletedCraftBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "server" "AlbionServer" NOT NULL,
    "materialCity" "AlbionCity" NOT NULL,
    "craftCity" "AlbionCity" NOT NULL,
    "sellCity" "AlbionCity" NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualMaterialCost" BIGINT NOT NULL DEFAULT 0,
    "actualReturnValue" BIGINT NOT NULL DEFAULT 0,
    "actualStationFee" BIGINT NOT NULL DEFAULT 0,
    "actualGrossRevenue" BIGINT NOT NULL DEFAULT 0,
    "actualTaxes" BIGINT NOT NULL DEFAULT 0,
    "actualNetProfit" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompletedCraftBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletedCraftBatchItem" (
    "id" TEXT NOT NULL,
    "completedBatchId" TEXT NOT NULL,
    "planItemId" TEXT,
    "outputItemId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL,
    "outputQuantity" INTEGER NOT NULL,
    "actualOutputUnitPrice" BIGINT NOT NULL,
    "actualMaterialCost" BIGINT NOT NULL,
    "actualReturnValue" BIGINT NOT NULL DEFAULT 0,
    "actualStationFee" BIGINT NOT NULL DEFAULT 0,
    "actualGrossRevenue" BIGINT NOT NULL,
    "actualTaxes" BIGINT NOT NULL DEFAULT 0,
    "actualNetProfit" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletedCraftBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultServer" "AlbionServer" NOT NULL DEFAULT 'EUROPE',
    "defaultSourceCity" "AlbionCity",
    "defaultDestinationCity" "AlbionCity",
    "defaultCapitalSilver" BIGINT,
    "defaultCapacityGrams" INTEGER,
    "defaultTaxRateBasisPoints" INTEGER NOT NULL DEFAULT 650,
    "defaultSetupFeeSilver" BIGINT NOT NULL DEFAULT 0,
    "maxDataAgeMinutes" INTEGER NOT NULL DEFAULT 60,
    "showStalePrices" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MarketPriceCache_server_city_quality_idx" ON "MarketPriceCache"("server", "city", "quality");

-- CreateIndex
CREATE INDEX "MarketPriceCache_fetchedAt_idx" ON "MarketPriceCache"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPriceCache_server_itemId_city_quality_key" ON "MarketPriceCache"("server", "itemId", "city", "quality");

-- CreateIndex
CREATE INDEX "PrivateMarketObservation_userId_server_itemId_city_quality__idx" ON "PrivateMarketObservation"("userId", "server", "itemId", "city", "quality", "orderType");

-- CreateIndex
CREATE INDEX "PrivateMarketObservation_observedAt_idx" ON "PrivateMarketObservation"("observedAt");

-- CreateIndex
CREATE INDEX "PrivateMarketObservation_expiresAt_idx" ON "PrivateMarketObservation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Route_server_sourceCity_destinationCity_key" ON "Route"("server", "sourceCity", "destinationCity");

-- CreateIndex
CREATE INDEX "TransportProfile_userId_idx" ON "TransportProfile"("userId");

-- CreateIndex
CREATE INDEX "TransportPlan_userId_createdAt_idx" ON "TransportPlan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TransportPlan_server_sourceCity_destinationCity_idx" ON "TransportPlan"("server", "sourceCity", "destinationCity");

-- CreateIndex
CREATE INDEX "TransportPlanItem_planId_idx" ON "TransportPlanItem"("planId");

-- CreateIndex
CREATE INDEX "TransportPlanItem_itemId_quality_idx" ON "TransportPlanItem"("itemId", "quality");

-- CreateIndex
CREATE UNIQUE INDEX "CompletedTrip_planId_key" ON "CompletedTrip"("planId");

-- CreateIndex
CREATE INDEX "CompletedTrip_userId_completedAt_idx" ON "CompletedTrip"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "CompletedTripItem_completedTripId_idx" ON "CompletedTripItem"("completedTripId");

-- CreateIndex
CREATE INDEX "CompletedTripItem_itemId_quality_idx" ON "CompletedTripItem"("itemId", "quality");

-- CreateIndex
CREATE INDEX "CraftRecipe_outputItemId_idx" ON "CraftRecipe"("outputItemId");

-- CreateIndex
CREATE INDEX "CraftRecipeIngredient_itemId_idx" ON "CraftRecipeIngredient"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CraftRecipeIngredient_recipeId_itemId_key" ON "CraftRecipeIngredient"("recipeId", "itemId");

-- CreateIndex
CREATE INDEX "CraftProfile_userId_idx" ON "CraftProfile"("userId");

-- CreateIndex
CREATE INDEX "CraftPlan_userId_createdAt_idx" ON "CraftPlan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CraftPlan_server_materialCity_craftCity_sellCity_idx" ON "CraftPlan"("server", "materialCity", "craftCity", "sellCity");

-- CreateIndex
CREATE INDEX "CraftPlanItem_planId_idx" ON "CraftPlanItem"("planId");

-- CreateIndex
CREATE INDEX "CraftPlanItem_outputItemId_quality_idx" ON "CraftPlanItem"("outputItemId", "quality");

-- CreateIndex
CREATE INDEX "CraftPlanIngredient_planItemId_idx" ON "CraftPlanIngredient"("planItemId");

-- CreateIndex
CREATE INDEX "CraftPlanIngredient_itemId_idx" ON "CraftPlanIngredient"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CompletedCraftBatch_planId_key" ON "CompletedCraftBatch"("planId");

-- CreateIndex
CREATE INDEX "CompletedCraftBatch_userId_completedAt_idx" ON "CompletedCraftBatch"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "CompletedCraftBatchItem_completedBatchId_idx" ON "CompletedCraftBatchItem"("completedBatchId");

-- CreateIndex
CREATE INDEX "CompletedCraftBatchItem_outputItemId_quality_idx" ON "CompletedCraftBatchItem"("outputItemId", "quality");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key" ON "UserSetting"("userId");

-- AddForeignKey
ALTER TABLE "MarketPriceCache" ADD CONSTRAINT "MarketPriceCache_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateMarketObservation" ADD CONSTRAINT "PrivateMarketObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateMarketObservation" ADD CONSTRAINT "PrivateMarketObservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportProfile" ADD CONSTRAINT "TransportProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPlan" ADD CONSTRAINT "TransportPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPlan" ADD CONSTRAINT "TransportPlan_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPlan" ADD CONSTRAINT "TransportPlan_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "TransportProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPlanItem" ADD CONSTRAINT "TransportPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TransportPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPlanItem" ADD CONSTRAINT "TransportPlanItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedTrip" ADD CONSTRAINT "CompletedTrip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedTrip" ADD CONSTRAINT "CompletedTrip_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TransportPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedTrip" ADD CONSTRAINT "CompletedTrip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedTripItem" ADD CONSTRAINT "CompletedTripItem_completedTripId_fkey" FOREIGN KEY ("completedTripId") REFERENCES "CompletedTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedTripItem" ADD CONSTRAINT "CompletedTripItem_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "TransportPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedTripItem" ADD CONSTRAINT "CompletedTripItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftRecipe" ADD CONSTRAINT "CraftRecipe_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftRecipeIngredient" ADD CONSTRAINT "CraftRecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "CraftRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftRecipeIngredient" ADD CONSTRAINT "CraftRecipeIngredient_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftProfile" ADD CONSTRAINT "CraftProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftPlan" ADD CONSTRAINT "CraftPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftPlan" ADD CONSTRAINT "CraftPlan_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CraftProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftPlanItem" ADD CONSTRAINT "CraftPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CraftPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftPlanItem" ADD CONSTRAINT "CraftPlanItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "CraftRecipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftPlanItem" ADD CONSTRAINT "CraftPlanItem_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftPlanIngredient" ADD CONSTRAINT "CraftPlanIngredient_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "CraftPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CraftPlanIngredient" ADD CONSTRAINT "CraftPlanIngredient_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedCraftBatch" ADD CONSTRAINT "CompletedCraftBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedCraftBatch" ADD CONSTRAINT "CompletedCraftBatch_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CraftPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedCraftBatchItem" ADD CONSTRAINT "CompletedCraftBatchItem_completedBatchId_fkey" FOREIGN KEY ("completedBatchId") REFERENCES "CompletedCraftBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedCraftBatchItem" ADD CONSTRAINT "CompletedCraftBatchItem_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "CraftPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedCraftBatchItem" ADD CONSTRAINT "CompletedCraftBatchItem_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
