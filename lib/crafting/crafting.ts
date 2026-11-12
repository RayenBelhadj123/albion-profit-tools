import { ageInMinutes, isFresh } from "@/lib/transport/freshness";
import { applyBasisPointRate, multiplySilver } from "@/lib/transport/money";

import type {
  CraftingCalculationInput,
  CraftingCalculationResult,
  CraftingIngredientInput,
  CraftingIngredientResult,
  CraftingWarning,
  FocusComparisonInput,
  FocusComparisonResult,
} from "./types";

export function calculateCraftingProfit(
  input: CraftingCalculationInput,
): CraftingCalculationResult {
  validateNonNegativeInteger(input.runs, "runs");
  validateNonNegativeInteger(
    input.outputQuantityPerRun,
    "outputQuantityPerRun",
  );
  validateNonNegativeInteger(input.nutritionPerRun, "nutritionPerRun");

  const warnings = new Set<CraftingWarning>(input.outputUnitPrice.warnings);

  if (input.resourceReturnRateBasisPoints < 0) {
    warnings.add("Resource return rate is negative");
  }

  if (input.resourceReturnRateBasisPoints > 10_000) {
    warnings.add("Resource return rate is unusually high");
  }

  if (input.outputUnitPrice.price === null) {
    warnings.add("Output price missing");
  }

  if (
    !isFresh(
      input.outputUnitPrice.observedAt,
      input.now,
      input.maxDataAgeMinutes,
    )
  ) {
    warnings.add("Output price is stale");
  }

  if (input.outputWeightGrams === null || input.outputWeightGrams <= 0) {
    warnings.add("Output weight missing");
  }

  if (input.focusCost === null) {
    warnings.add("Focus cost missing");
  }

  const ingredientResults = input.ingredients.map((ingredient) =>
    calculateIngredient(ingredient, input, warnings),
  );

  const outputQuantity = input.outputQuantityPerRun * input.runs;
  const materialCost = sumBigInt(
    ingredientResults.map((ingredient) => ingredient.totalCost),
  );
  const returnedMaterialValue = sumBigInt(
    ingredientResults.map((ingredient) => ingredient.returnValue),
  );
  const netMaterialCost = materialCost - returnedMaterialValue;
  const stationFee =
    (input.stationFeePer100Nutrition *
      BigInt(input.nutritionPerRun) *
      BigInt(input.runs)) /
    100n;
  const grossRevenue =
    input.outputUnitPrice.price !== null
      ? multiplySilver(input.outputUnitPrice.price, outputQuantity)
      : 0n;
  const taxes = applyBasisPointRate(grossRevenue, input.taxRateBasisPoints);
  const setupFees =
    input.setupFeeSilver +
    applyBasisPointRate(grossRevenue, input.setupFeeRateBasisPoints ?? 0);
  const investment = netMaterialCost + stationFee + setupFees;
  const netProfit = grossRevenue - taxes - setupFees - stationFee - netMaterialCost;
  const roiBasisPoints =
    investment > 0n ? Number((netProfit * 10_000n) / investment) : null;
  const inputWeightGrams = sumNullableNumbers(
    ingredientResults.map((ingredient) => ingredient.totalWeightGrams),
  );
  const outputWeightGrams =
    input.outputWeightGrams && input.outputWeightGrams > 0
      ? input.outputWeightGrams * outputQuantity
      : null;
  const profitPerFocus =
    input.focusCost && input.focusCost > 0
      ? Number(netProfit / BigInt(input.focusCost))
      : null;

  if (netProfit <= 0n) {
    warnings.add("Expected profit is not positive");
  }

  const warningList = Array.from(warnings);

  return {
    outputItemId: input.outputItemId,
    outputQuality: input.outputQuality,
    runs: input.runs,
    outputQuantity,
    outputUnitPrice: input.outputUnitPrice.price,
    outputPriceSource:
      input.outputUnitPrice.price !== null ? input.outputUnitPrice.source : null,
    materialCost,
    returnedMaterialValue,
    netMaterialCost,
    stationFee,
    grossRevenue,
    taxes,
    setupFees,
    investment,
    netProfit,
    roiBasisPoints,
    focusCost: input.focusCost ?? null,
    profitPerFocus,
    inputWeightGrams,
    outputWeightGrams,
    outputPriceAgeMinutes: ageInMinutes(input.outputUnitPrice.observedAt, input.now),
    ingredients: ingredientResults,
    confidence: calculateConfidence(warningList),
    warnings: warningList,
    isProfitable: netProfit > 0n,
  };
}

export function compareFocusCraftingProfit(
  input: FocusComparisonInput,
): FocusComparisonResult {
  const withoutFocus = calculateCraftingProfit({
    ...input,
    resourceReturnRateBasisPoints: input.noFocusReturnRateBasisPoints,
    focusCost: null,
  });
  const withFocus = calculateCraftingProfit({
    ...input,
    resourceReturnRateBasisPoints: input.focusReturnRateBasisPoints,
    focusCost: input.focusCost,
  });
  const extraProfitFromFocus = withFocus.netProfit - withoutFocus.netProfit;
  const profitPerFocus =
    input.focusCost && input.focusCost > 0
      ? Number(extraProfitFromFocus / BigInt(input.focusCost))
      : null;
  const warnings = new Set<CraftingWarning>([
    ...withoutFocus.warnings,
    ...withFocus.warnings,
  ]);

  if (!input.focusCost || input.focusCost <= 0) {
    warnings.add("Focus cost missing");
  }

  return {
    withoutFocus,
    withFocus: {
      ...withFocus,
      profitPerFocus,
    },
    extraProfitFromFocus,
    profitPerFocus,
    warnings: Array.from(warnings),
  };
}

function calculateIngredient(
  ingredient: CraftingIngredientInput,
  input: CraftingCalculationInput,
  sharedWarnings: Set<CraftingWarning>,
): CraftingIngredientResult {
  validateNonNegativeInteger(ingredient.quantityPerRun, "quantityPerRun");

  const warnings = new Set<CraftingWarning>(ingredient.unitPrice.warnings);
  const quantityRequired = ingredient.quantityPerRun * input.runs;
  const receivesReturn = ingredient.receivesReturn ?? true;
  const quantityReturned = receivesReturn
    ? Math.floor(
        (quantityRequired * Math.max(0, input.resourceReturnRateBasisPoints)) /
          10_000,
      )
    : 0;
  const netQuantityConsumed = quantityRequired - quantityReturned;
  const totalCost =
    ingredient.unitPrice.price !== null
      ? multiplySilver(ingredient.unitPrice.price, quantityRequired)
      : 0n;
  const returnValue =
    ingredient.unitPrice.price !== null
      ? multiplySilver(ingredient.unitPrice.price, quantityReturned)
      : 0n;
  const totalWeightGrams =
    ingredient.weightGrams && ingredient.weightGrams > 0
      ? ingredient.weightGrams * quantityRequired
      : null;

  if (ingredient.unitPrice.price === null) {
    warnings.add("Material price missing");
  }

  if (
    !isFresh(
      ingredient.unitPrice.observedAt,
      input.now,
      input.maxDataAgeMinutes,
    )
  ) {
    warnings.add("Material price is stale");
  }

  if (ingredient.unitPrice.availableQuantity === null) {
    warnings.add("Material quantity unknown");
  }

  if (ingredient.weightGrams === null || ingredient.weightGrams <= 0) {
    warnings.add("Material weight missing");
  }

  for (const warning of warnings) {
    sharedWarnings.add(warning);
  }

  return {
    itemId: ingredient.itemId,
    quantityRequired,
    quantityReturned,
    netQuantityConsumed,
    unitPrice: ingredient.unitPrice.price,
    priceSource:
      ingredient.unitPrice.price !== null ? ingredient.unitPrice.source : null,
    totalCost,
    returnValue,
    weightGrams: ingredient.weightGrams,
    totalWeightGrams,
    priceAgeMinutes: ageInMinutes(ingredient.unitPrice.observedAt, input.now),
    warnings: Array.from(warnings),
  };
}

function calculateConfidence(warnings: CraftingWarning[]) {
  if (
    warnings.includes("Material price missing") ||
    warnings.includes("Output price missing") ||
    warnings.includes("Material price is stale") ||
    warnings.includes("Output price is stale") ||
    warnings.includes("Material weight missing") ||
    warnings.includes("Output weight missing") ||
    warnings.includes("Historical price estimate") ||
    warnings.includes("Calculated price estimate")
  ) {
    return "LOW";
  }

  if (
    warnings.includes("Material quantity unknown") ||
    warnings.includes("Focus cost missing") ||
    warnings.includes("Last known public price fallback")
  ) {
    return "MEDIUM";
  }

  return "HIGH";
}

function sumBigInt(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

function sumNullableNumbers(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) {
    return null;
  }

  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function validateNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
}
