import type { Confidence, PriceSource } from "@/lib/transport/types";

export type CraftingWarning =
  | "Material price missing"
  | "Output price missing"
  | "Material price is stale"
  | "Output price is stale"
  | "Material quantity unknown"
  | "Private price overrides public price"
  | "Last known public price fallback"
  | "Historical price estimate"
  | "Calculated price estimate"
  | "Material weight missing"
  | "Output weight missing"
  | "Focus cost missing"
  | "Expected profit is not positive"
  | "Resource return rate is unusually high"
  | "Resource return rate is negative"
  | "Material price depends on buy order"
  | "Output price depends on sell order";

export type CraftingSelectedPrice = {
  price: bigint | null;
  source: PriceSource;
  observedAt: Date | null;
  availableQuantity: number | null;
  warnings: CraftingWarning[];
};

export type CraftingIngredientInput = {
  itemId: string;
  quantityPerRun: number;
  unitPrice: CraftingSelectedPrice;
  weightGrams: number | null;
  receivesReturn?: boolean;
};

export type CraftingCalculationInput = {
  outputItemId: string;
  outputQuality: number;
  outputQuantityPerRun: number;
  runs: number;
  outputUnitPrice: CraftingSelectedPrice;
  outputWeightGrams: number | null;
  ingredients: CraftingIngredientInput[];
  resourceReturnRateBasisPoints: number;
  focusCost?: number | null;
  stationFeePer100Nutrition: bigint;
  nutritionPerRun: number;
  taxRateBasisPoints: number;
  setupFeeSilver: bigint;
  setupFeeRateBasisPoints?: number;
  now: Date;
  maxDataAgeMinutes: number;
};

export type CraftingIngredientResult = {
  itemId: string;
  quantityRequired: number;
  quantityReturned: number;
  netQuantityConsumed: number;
  unitPrice: bigint | null;
  priceSource: PriceSource | null;
  totalCost: bigint;
  returnValue: bigint;
  weightGrams: number | null;
  totalWeightGrams: number | null;
  priceAgeMinutes: number | null;
  warnings: CraftingWarning[];
};

export type CraftingCalculationResult = {
  outputItemId: string;
  outputQuality: number;
  runs: number;
  outputQuantity: number;
  outputUnitPrice: bigint | null;
  outputPriceSource: PriceSource | null;
  materialCost: bigint;
  returnedMaterialValue: bigint;
  netMaterialCost: bigint;
  stationFee: bigint;
  grossRevenue: bigint;
  taxes: bigint;
  setupFees: bigint;
  investment: bigint;
  netProfit: bigint;
  roiBasisPoints: number | null;
  focusCost: number | null;
  profitPerFocus: number | null;
  inputWeightGrams: number | null;
  outputWeightGrams: number | null;
  outputPriceAgeMinutes: number | null;
  ingredients: CraftingIngredientResult[];
  confidence: Confidence;
  warnings: CraftingWarning[];
  isProfitable: boolean;
};

export type FocusComparisonInput = Omit<
  CraftingCalculationInput,
  "resourceReturnRateBasisPoints" | "focusCost"
> & {
  noFocusReturnRateBasisPoints: number;
  focusReturnRateBasisPoints: number;
  focusCost: number | null;
};

export type FocusComparisonResult = {
  withoutFocus: CraftingCalculationResult;
  withFocus: CraftingCalculationResult;
  extraProfitFromFocus: bigint;
  profitPerFocus: number | null;
  warnings: CraftingWarning[];
};
