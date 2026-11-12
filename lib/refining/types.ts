import type { CraftingCalculationResult, CraftingSelectedPrice } from "@/lib/crafting/types";

export type RefiningIngredientInput = {
  itemId: string;
  quantityPerRun: number;
  unitPrice: CraftingSelectedPrice;
  weightGrams: number | null;
  receivesReturn?: boolean;
  isPrimaryMaterial?: boolean;
};

export type RefiningCalculationInput = {
  outputItemId: string;
  outputQuality: number;
  outputQuantityPerRun: number;
  runs: number;
  outputUnitPrice: CraftingSelectedPrice;
  outputWeightGrams: number | null;
  ingredients: RefiningIngredientInput[];
  noFocusReturnRateBasisPoints: number;
  focusReturnRateBasisPoints: number;
  focusCost: number | null;
  stationFeePer100Nutrition: bigint;
  nutritionPerRun: number;
  taxRateBasisPoints: number;
  setupFeeSilver: bigint;
  setupFeeRateBasisPoints?: number;
  targetRoiBasisPoints: number;
  now: Date;
  maxDataAgeMinutes: number;
};

export type RefiningCalculationResult = {
  withoutFocus: CraftingCalculationResult;
  withFocus: CraftingCalculationResult;
  extraProfitFromFocus: bigint;
  profitPerFocus: number | null;
  maxPrimaryMaterialUnitPrice: bigint | null;
  primaryMaterialItemId: string | null;
  targetRoiBasisPoints: number;
  warnings: string[];
};
