export type PriceSource =
  | "PUBLIC"
  | "PRIVATE_MANUAL"
  | "PRIVATE_IMPORT"
  | "CALCULATED";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export type TransportWarning =
  | "Source price is stale"
  | "Destination price is stale"
  | "Source price missing"
  | "Destination price missing"
  | "Quantity unknown"
  | "Private price overrides public price"
  | "Last known public price fallback"
  | "Historical average price estimate"
  | "Calculated price estimate"
  | "Destination is a historical trade estimate, not a live buy order"
  | "Missing route duration"
  | "Item weight missing"
  | "Insufficient capital"
  | "Insufficient carrying capacity"
  | "No profitable quantity"
  | "Expected profit is not positive"
  | "Profit depends on sell order, not instant sale"
  | "Fits capital but not full carrying capacity";

export type MarketPriceCandidate = {
  price: bigint | null;
  observedAt: Date | null;
  availableQuantity: number | null;
  source: PriceSource;
  expiresAt?: Date | null;
  preferredOverride?: boolean;
  isCachedFallback?: boolean;
};

export type SelectedMarketPrice = MarketPriceCandidate & {
  warnings: TransportWarning[];
};

export type PriceSelectionInput = {
  publicPrice?: MarketPriceCandidate | null;
  lastKnownPublicPrice?: MarketPriceCandidate | null;
  historicalPrice?: MarketPriceCandidate | null;
  calculatedPrice?: MarketPriceCandidate | null;
  privatePrices?: MarketPriceCandidate[];
  now: Date;
  maxDataAgeMinutes: number;
};

export type OpportunityInput = {
  itemId: string;
  quality: number;
  sourceCity: string;
  destinationCity: string;
  purchasePrice: SelectedMarketPrice;
  expectedSalePrice: SelectedMarketPrice;
  itemWeightGrams: number | null;
  availableCapital: bigint | null;
  carryingCapacityGrams: number;
  taxRateBasisPoints: number;
  setupFeeSilver: bigint;
  setupFeeRateBasisPoints?: number;
  routeDurationMinutes?: number | null;
  userMaximumQuantity?: number | null;
  now: Date;
  maxDataAgeMinutes: number;
  maxSourceDataAgeMinutes?: number;
  maxDestinationDataAgeMinutes?: number;
};

export type TransportOpportunity = {
  itemId: string;
  quality: number;
  sourceCity: string;
  destinationCity: string;
  purchasePrice: bigint | null;
  expectedSalePrice: bigint | null;
  recommendedQuantity: number;
  maximumAffordableQuantity: number;
  maximumCarryableQuantity: number;
  availableQuantity: number | null;
  itemWeightGrams: number | null;
  totalWeightGrams: number | null;
  investment: bigint;
  grossRevenue: bigint;
  taxes: bigint;
  setupFees: bigint;
  netProfit: bigint;
  roiBasisPoints: number | null;
  profitPerKgSilver: number | null;
  profitPerMinuteSilver: number | null;
  sourcePriceAgeMinutes: number | null;
  destinationPriceAgeMinutes: number | null;
  purchasePriceSource: PriceSource | null;
  salePriceSource: PriceSource | null;
  confidence: Confidence;
  warnings: TransportWarning[];
  isProfitable: boolean;
};
