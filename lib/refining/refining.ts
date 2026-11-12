import { applyBasisPointRate, multiplySilver } from "@/lib/transport/money";
import { compareFocusCraftingProfit } from "@/lib/crafting/crafting";
import type {
  CraftingCalculationInput,
  CraftingCalculationResult,
  CraftingIngredientInput,
} from "@/lib/crafting/types";

import type { RefiningCalculationInput, RefiningCalculationResult } from "./types";

export function calculateRefiningProfit(
  input: RefiningCalculationInput,
): RefiningCalculationResult {
  const comparison = compareFocusCraftingProfit({
    ...toCraftingInput(input),
    noFocusReturnRateBasisPoints: input.noFocusReturnRateBasisPoints,
    focusReturnRateBasisPoints: input.focusReturnRateBasisPoints,
    focusCost: input.focusCost,
  });
  const primaryMaterial = input.ingredients.find(
    (ingredient) => ingredient.isPrimaryMaterial,
  );
  const maxPrimaryMaterialUnitPrice = primaryMaterial
    ? calculateMaxPrimaryMaterialUnitPrice(input, primaryMaterial.itemId)
    : null;
  const warnings = new Set<string>(comparison.warnings);

  if (!primaryMaterial) {
    warnings.add("Primary refining material missing");
  }

  return {
    ...comparison,
    maxPrimaryMaterialUnitPrice,
    primaryMaterialItemId: primaryMaterial?.itemId ?? null,
    targetRoiBasisPoints: input.targetRoiBasisPoints,
    warnings: Array.from(warnings),
  };
}

function toCraftingInput(input: RefiningCalculationInput): Omit<
  CraftingCalculationInput,
  "resourceReturnRateBasisPoints" | "focusCost"
> {
  return {
    outputItemId: input.outputItemId,
    outputQuality: input.outputQuality,
    outputQuantityPerRun: input.outputQuantityPerRun,
    runs: input.runs,
    outputUnitPrice: input.outputUnitPrice,
    outputWeightGrams: input.outputWeightGrams,
    ingredients: input.ingredients.map(
      (ingredient): CraftingIngredientInput => ({
        itemId: ingredient.itemId,
        quantityPerRun: ingredient.quantityPerRun,
        unitPrice: ingredient.unitPrice,
        weightGrams: ingredient.weightGrams,
        receivesReturn: ingredient.receivesReturn,
      }),
    ),
    stationFeePer100Nutrition: input.stationFeePer100Nutrition,
    nutritionPerRun: input.nutritionPerRun,
    taxRateBasisPoints: input.taxRateBasisPoints,
    setupFeeSilver: input.setupFeeSilver,
    setupFeeRateBasisPoints: input.setupFeeRateBasisPoints,
    now: input.now,
    maxDataAgeMinutes: input.maxDataAgeMinutes,
  };
}

function calculateMaxPrimaryMaterialUnitPrice(
  input: RefiningCalculationInput,
  primaryMaterialItemId: string,
): bigint | null {
  const zeroedIngredients = input.ingredients.map((ingredient) =>
    ingredient.itemId === primaryMaterialItemId
      ? {
          ...ingredient,
          unitPrice: {
            ...ingredient.unitPrice,
            price: 0n,
          },
        }
      : ingredient,
  );
  const zeroedResult = compareFocusCraftingProfit({
    ...toCraftingInput({
      ...input,
      ingredients: zeroedIngredients,
    }),
    noFocusReturnRateBasisPoints: input.noFocusReturnRateBasisPoints,
    focusReturnRateBasisPoints: input.focusReturnRateBasisPoints,
    focusCost: input.focusCost,
  }).withFocus;

  const primaryIngredient = input.ingredients.find(
    (ingredient) => ingredient.itemId === primaryMaterialItemId,
  );

  if (!primaryIngredient) {
    return null;
  }

  const quantityRequired = primaryIngredient.quantityPerRun * input.runs;
  const quantityReturned =
    primaryIngredient.receivesReturn === false
      ? 0
      : Math.floor(
          (quantityRequired * input.focusReturnRateBasisPoints) / 10_000,
        );
  const netQuantityConsumed = quantityRequired - quantityReturned;

  if (netQuantityConsumed <= 0) {
    return null;
  }

  return solveMaxUnitPrice({
    resultWithPrimaryPriceZero: zeroedResult,
    netPrimaryQuantityConsumed: netQuantityConsumed,
    targetRoiBasisPoints: input.targetRoiBasisPoints,
  });
}

function solveMaxUnitPrice({
  resultWithPrimaryPriceZero,
  netPrimaryQuantityConsumed,
  targetRoiBasisPoints,
}: {
  resultWithPrimaryPriceZero: CraftingCalculationResult;
  netPrimaryQuantityConsumed: number;
  targetRoiBasisPoints: number;
}): bigint | null {
  const grossRevenue = resultWithPrimaryPriceZero.grossRevenue;
  const taxes = applyBasisPointRate(
    grossRevenue,
    resultWithPrimaryPriceZero.taxes > 0n && grossRevenue > 0n
      ? Number((resultWithPrimaryPriceZero.taxes * 10_000n) / grossRevenue)
      : 0,
  );
  const fixedInvestment = resultWithPrimaryPriceZero.investment;
  const netBeforePrimary =
    grossRevenue -
    taxes -
    resultWithPrimaryPriceZero.setupFees -
    resultWithPrimaryPriceZero.stationFee -
    resultWithPrimaryPriceZero.netMaterialCost;
  const numerator =
    netBeforePrimary * 10_000n -
    fixedInvestment * BigInt(targetRoiBasisPoints);
  const denominator =
    BigInt(netPrimaryQuantityConsumed) *
    BigInt(10_000 + targetRoiBasisPoints);

  if (numerator <= 0n || denominator <= 0n) {
    return null;
  }

  return numerator / denominator;
}

export function refiningIngredientTotalCost(
  unitPrice: bigint | null,
  quantity: number,
): bigint {
  return unitPrice === null ? 0n : multiplySilver(unitPrice, quantity);
}
