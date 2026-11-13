export type Opportunity = {
  itemId: string;
  quality: number;
  itemName: string;
  category: string;
  sourceCity: string;
  destinationCity: string;
  purchasePrice: string | null;
  expectedSalePrice: string | null;
  recommendedQuantity: number;
  investment: string;
  grossRevenue?: string;
  totalWeightGrams?: number | null;
  profitPerMinuteSilver?: number | null;
  routeDurationMinutes?: number | null;
  isProfitable?: boolean;
  availableQuantity?: number | null;
  taxes: string;
  setupFees: string;
  netProfit: string;
  roiBasisPoints: number | null;
  profitPerKgSilver: number | null;
  marketValue: string;
  sourcePriceAgeMinutes: number | null;
  destinationPriceAgeMinutes: number | null;
  score: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  warnings: string[];
  purchasePriceSource: string | null;
  salePriceSource: string | null;
  purchasePriceLabel?: string;
  salePriceLabel?: string;
};

export type SortKey = "combined" | "item" | "route" | "purchasePrice" | "expectedSalePrice" | "quantity" | "investment" | "fees" | "profit" | "roi" | "profitPerKg" | "marketValue" | "sourceFreshness" | "destinationFreshness" | "confidence";
export type SortDirection = "asc" | "desc";
export function rankProgressiveOpportunities(
  items: Opportunity[],
  sortBy: SortKey,
  maxSourceDataAgeMinutes: number,
  maxDestinationDataAgeMinutes: number,
  direction: SortDirection,
) {
  let ranked = items.map((item) => ({ ...item }));
  if (sortBy === "combined") {
    const maxProfit = ranked.reduce((maximum, item) => bigintMax(maximum, BigInt(item.netProfit)), 0n);
    const maxMarketValue = ranked.reduce((maximum, item) => bigintMax(maximum, BigInt(item.marketValue)), 0n);
    const maxRoi = ranked.reduce((maximum, item) => Math.max(maximum, item.roiBasisPoints ?? 0), 0);
    ranked = ranked.map((item) => {
      const sourceFreshness = Math.max(0, 1 - (item.sourcePriceAgeMinutes ?? maxSourceDataAgeMinutes * 2) / maxSourceDataAgeMinutes);
      const destinationFreshness = Math.max(0, 1 - (item.destinationPriceAgeMinutes ?? maxDestinationDataAgeMinutes * 2) / maxDestinationDataAgeMinutes);
      const freshnessScore = sourceFreshness * 0.8 + destinationFreshness * 0.2;
      const profitScore = maxProfit > 0n ? Number((BigInt(item.netProfit) * 10_000n) / maxProfit) / 10_000 : 0;
      const valueScore = maxMarketValue > 0n ? Number((BigInt(item.marketValue) * 10_000n) / maxMarketValue) / 10_000 : 0;
      const roiScore = maxRoi > 0 ? (item.roiBasisPoints ?? 0) / maxRoi : 0;
      return { ...item, score: Math.round((profitScore * 0.35 + roiScore * 0.25 + valueScore * 0.15 + freshnessScore * 0.25) * 10_000) / 100 };
    });
  }
  const multiplier = direction === "asc" ? 1 : -1;
  ranked.sort((left, right) => compareOpportunityField(left, right, sortBy) * multiplier);
  return ranked;
}

function compareOpportunityField(left: Opportunity, right: Opportunity, sortBy: SortKey) {
  if (sortBy === "item") return left.itemName.localeCompare(right.itemName) || left.itemId.localeCompare(right.itemId);
  if (sortBy === "route") return `${left.sourceCity}:${left.destinationCity}`.localeCompare(`${right.sourceCity}:${right.destinationCity}`);
  if (sortBy === "purchasePrice") return compareNullableBigIntStrings(left.purchasePrice, right.purchasePrice);
  if (sortBy === "expectedSalePrice") return compareNullableBigIntStrings(left.expectedSalePrice, right.expectedSalePrice);
  if (sortBy === "quantity") return left.recommendedQuantity - right.recommendedQuantity;
  if (sortBy === "investment") return compareBigIntStrings(left.investment, right.investment);
  if (sortBy === "fees") return compareBigIntStrings((BigInt(left.taxes) + BigInt(left.setupFees)).toString(), (BigInt(right.taxes) + BigInt(right.setupFees)).toString());
  if (sortBy === "profit") return compareBigIntStrings(left.netProfit, right.netProfit);
  if (sortBy === "marketValue") return compareBigIntStrings(left.marketValue, right.marketValue);
  if (sortBy === "roi") return (left.roiBasisPoints ?? -Infinity) - (right.roiBasisPoints ?? -Infinity);
  if (sortBy === "profitPerKg") return (left.profitPerKgSilver ?? -Infinity) - (right.profitPerKgSilver ?? -Infinity);
  if (sortBy === "sourceFreshness") return freshnessSortValue(left.sourcePriceAgeMinutes) - freshnessSortValue(right.sourcePriceAgeMinutes);
  if (sortBy === "destinationFreshness") return freshnessSortValue(left.destinationPriceAgeMinutes) - freshnessSortValue(right.destinationPriceAgeMinutes);
  if (sortBy === "confidence") return confidenceRank(left.confidence) - confidenceRank(right.confidence);
  return left.score - right.score;
}

export function defaultSortDirection(sortBy: SortKey): SortDirection {
  return sortBy === "item" || sortBy === "route" || sortBy === "sourceFreshness" || sortBy === "destinationFreshness" ? "asc" : "desc";
}

function confidenceRank(confidence: Opportunity["confidence"]) {
  return confidence === "HIGH" ? 3 : confidence === "MEDIUM" ? 2 : 1;
}

function compareNullableBigIntStrings(left: string | null, right: string | null) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return compareBigIntStrings(left, right);
}

function compareBigIntStrings(left: string, right: string) {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
}

function bigintMax(left: bigint, right: bigint) { return left > right ? left : right; }
function freshnessSortValue(value: number | null) { return value ?? Infinity; }

export function meetsScannerThresholds(item: Opportunity, minimumProfitPerUnit: bigint, minimumRoiBasisPoints: number, maximumSourceAge: number, maximumDestinationAge: number) {
  if (!Number.isSafeInteger(item.recommendedQuantity) || item.recommendedQuantity <= 0) return false;
  const netProfit = BigInt(item.netProfit);
  if (netProfit <= 0n) return false;
  // Cross multiplication preserves fractional losses and exact bigint thresholds.
  return netProfit >= minimumProfitPerUnit * BigInt(item.recommendedQuantity) &&
    (item.roiBasisPoints ?? -Infinity) >= minimumRoiBasisPoints &&
    item.sourcePriceAgeMinutes !== null && item.sourcePriceAgeMinutes <= maximumSourceAge &&
    item.destinationPriceAgeMinutes !== null && item.destinationPriceAgeMinutes <= maximumDestinationAge;
}
