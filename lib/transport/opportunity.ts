import { ageInMinutes, isFresh } from "./freshness";
import { applyBasisPointRate, multiplySilver } from "./money";
import type {
  Confidence,
  OpportunityInput,
  TransportOpportunity,
  TransportWarning,
} from "./types";

export function calculateTransportOpportunity(
  input: OpportunityInput,
): TransportOpportunity {
  const maxSourceDataAgeMinutes =
    input.maxSourceDataAgeMinutes ?? input.maxDataAgeMinutes;
  const maxDestinationDataAgeMinutes =
    input.maxDestinationDataAgeMinutes ?? input.maxDataAgeMinutes;
  const warnings = new Set<TransportWarning>([
    ...input.purchasePrice.warnings,
    ...input.expectedSalePrice.warnings,
  ]);

  if (input.purchasePrice.price === null) {
    warnings.add("Source price missing");
  }

  if (input.expectedSalePrice.price === null) {
    warnings.add("Destination price missing");
  }

  if (
    !isFresh(
      input.purchasePrice.observedAt,
      input.now,
      maxSourceDataAgeMinutes,
    )
  ) {
    warnings.add("Source price is stale");
  }

  if (
    !isFresh(
      input.expectedSalePrice.observedAt,
      input.now,
      maxDestinationDataAgeMinutes,
    )
  ) {
    warnings.add("Destination price is stale");
  }

  if (input.purchasePrice.availableQuantity === null) {
    warnings.add("Quantity unknown");
  }

  if (input.itemWeightGrams === null || input.itemWeightGrams <= 0) {
    warnings.add("Item weight missing");
  }

  if (!input.routeDurationMinutes || input.routeDurationMinutes <= 0) {
    warnings.add("Missing route duration");
  }

  const emptyResult = createEmptyOpportunity(input, Array.from(warnings));

  if (
    input.purchasePrice.price === null ||
    input.expectedSalePrice.price === null ||
    input.itemWeightGrams === null ||
    input.itemWeightGrams <= 0
  ) {
    return emptyResult;
  }

  const maximumAffordableQuantity =
    input.availableCapital === null
      ? Number.MAX_SAFE_INTEGER
      : input.purchasePrice.price > 0n
      ? Number(input.availableCapital / input.purchasePrice.price)
      : 0;
  const maximumCarryableQuantity = Math.floor(
    input.carryingCapacityGrams / input.itemWeightGrams,
  );

  if (input.availableCapital !== null && maximumAffordableQuantity <= 0) {
    warnings.add("Insufficient capital");
  }

  if (maximumCarryableQuantity <= 0) {
    warnings.add("Insufficient carrying capacity");
  }

  const availableQuantityLimit =
    input.purchasePrice.availableQuantity ?? Number.MAX_SAFE_INTEGER;
  const userQuantityLimit =
    input.userMaximumQuantity ?? Number.MAX_SAFE_INTEGER;
  const recommendedQuantity = Math.max(
    0,
    Math.min(
      maximumAffordableQuantity,
      maximumCarryableQuantity,
      availableQuantityLimit,
      userQuantityLimit,
    ),
  );

  if (recommendedQuantity <= 0) {
    warnings.add("No profitable quantity");
    return {
      ...emptyResult,
      maximumAffordableQuantity,
      maximumCarryableQuantity,
      warnings: Array.from(warnings),
      confidence: calculateConfidence(input, Array.from(warnings)),
    };
  }

  const investment = multiplySilver(input.purchasePrice.price, recommendedQuantity);
  const grossRevenue = multiplySilver(
    input.expectedSalePrice.price,
    recommendedQuantity,
  );
  const taxes = applyBasisPointRate(grossRevenue, input.taxRateBasisPoints);
  const setupFees = input.setupFeeSilver + applyBasisPointRate(
    grossRevenue,
    input.setupFeeRateBasisPoints ?? 0,
  );
  const netProfit = grossRevenue - taxes - setupFees - investment;
  const totalWeightGrams = input.itemWeightGrams * recommendedQuantity;
  const roiBasisPoints =
    investment > 0n ? Number((netProfit * 10_000n) / investment) : null;
  const profitPerKgSilver =
    totalWeightGrams > 0
      ? Number((netProfit * 1_000n) / BigInt(totalWeightGrams))
      : null;
  const profitPerMinuteSilver =
    input.routeDurationMinutes && input.routeDurationMinutes > 0
      ? Number(netProfit / BigInt(input.routeDurationMinutes))
      : null;

  if (netProfit <= 0n) {
    warnings.add("Expected profit is not positive");
  }

  if (
    input.purchasePrice.availableQuantity === null &&
    recommendedQuantity === maximumCarryableQuantity &&
    input.availableCapital !== null &&
    maximumAffordableQuantity >= maximumCarryableQuantity
  ) {
    warnings.add("Fits capital but not full carrying capacity");
  }

  const warningList = Array.from(warnings);

  return {
    itemId: input.itemId,
    quality: input.quality,
    sourceCity: input.sourceCity,
    destinationCity: input.destinationCity,
    purchasePrice: input.purchasePrice.price,
    expectedSalePrice: input.expectedSalePrice.price,
    recommendedQuantity,
    maximumAffordableQuantity,
    maximumCarryableQuantity,
    availableQuantity: input.purchasePrice.availableQuantity,
    itemWeightGrams: input.itemWeightGrams,
    totalWeightGrams,
    investment,
    grossRevenue,
    taxes,
    setupFees,
    netProfit,
    roiBasisPoints,
    profitPerKgSilver,
    profitPerMinuteSilver,
    sourcePriceAgeMinutes: ageInMinutes(input.purchasePrice.observedAt, input.now),
    destinationPriceAgeMinutes: ageInMinutes(
      input.expectedSalePrice.observedAt,
      input.now,
    ),
    purchasePriceSource: input.purchasePrice.source,
    salePriceSource: input.expectedSalePrice.source,
    confidence: calculateConfidence(input, warningList),
    warnings: warningList,
    isProfitable: netProfit > 0n,
  };
}

function createEmptyOpportunity(
  input: OpportunityInput,
  warnings: TransportWarning[],
): TransportOpportunity {
  return {
    itemId: input.itemId,
    quality: input.quality,
    sourceCity: input.sourceCity,
    destinationCity: input.destinationCity,
    purchasePrice: input.purchasePrice.price,
    expectedSalePrice: input.expectedSalePrice.price,
    recommendedQuantity: 0,
    maximumAffordableQuantity: 0,
    maximumCarryableQuantity: 0,
    availableQuantity: input.purchasePrice.availableQuantity,
    itemWeightGrams: input.itemWeightGrams,
    totalWeightGrams: null,
    investment: 0n,
    grossRevenue: 0n,
    taxes: 0n,
    setupFees: 0n,
    netProfit: 0n,
    roiBasisPoints: null,
    profitPerKgSilver: null,
    profitPerMinuteSilver: null,
    sourcePriceAgeMinutes: ageInMinutes(input.purchasePrice.observedAt, input.now),
    destinationPriceAgeMinutes: ageInMinutes(
      input.expectedSalePrice.observedAt,
      input.now,
    ),
    purchasePriceSource: input.purchasePrice.price
      ? input.purchasePrice.source
      : null,
    salePriceSource: input.expectedSalePrice.price
      ? input.expectedSalePrice.source
      : null,
    confidence: calculateConfidence(input, warnings),
    warnings,
    isProfitable: false,
  };
}

function calculateConfidence(
  input: OpportunityInput,
  warnings: TransportWarning[],
): Confidence {
  if (
    warnings.includes("Source price missing") ||
    warnings.includes("Destination price missing") ||
    warnings.includes("Source price is stale") ||
    warnings.includes("Destination price is stale") ||
    warnings.includes("Historical average price estimate") ||
    warnings.includes("Calculated price estimate") ||
    warnings.includes("Destination is a historical trade estimate, not a live buy order") ||
    warnings.includes("Item weight missing")
  ) {
    return "LOW";
  }

  if (
    warnings.includes("Quantity unknown") ||
    warnings.includes("Missing route duration") ||
    input.purchasePrice.source === "PUBLIC" ||
    input.expectedSalePrice.source === "PUBLIC"
  ) {
    return "MEDIUM";
  }

  return "HIGH";
}
