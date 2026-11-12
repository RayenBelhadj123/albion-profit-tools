import { describe, expect, it } from "vitest";

import { calculateRefiningProfit } from "./refining";
import type { RefiningCalculationInput } from "./types";
import type { CraftingSelectedPrice } from "@/lib/crafting/types";

const now = new Date("2026-08-06T12:00:00Z");

function price(value: bigint): CraftingSelectedPrice {
  return {
    price: value,
    source: "PRIVATE_MANUAL",
    observedAt: new Date("2026-08-06T11:55:00Z"),
    availableQuantity: 999,
    warnings: [],
  };
}

function baseInput(
  overrides: Partial<RefiningCalculationInput> = {},
): RefiningCalculationInput {
  return {
    outputItemId: "T4_LEATHER",
    outputQuality: 1,
    outputQuantityPerRun: 1,
    runs: 100,
    outputUnitPrice: price(400n),
    outputWeightGrams: 100,
    ingredients: [
      {
        itemId: "T4_HIDE",
        quantityPerRun: 2,
        unitPrice: price(100n),
        weightGrams: 70,
        isPrimaryMaterial: true,
      },
      {
        itemId: "T3_LEATHER",
        quantityPerRun: 1,
        unitPrice: price(120n),
        weightGrams: 50,
        receivesReturn: false,
      },
    ],
    noFocusReturnRateBasisPoints: 3670,
    focusReturnRateBasisPoints: 5390,
    focusCost: 1_200,
    stationFeePer100Nutrition: 250n,
    nutritionPerRun: 1,
    taxRateBasisPoints: 650,
    setupFeeSilver: 0n,
    targetRoiBasisPoints: 0,
    now,
    maxDataAgeMinutes: 60,
    ...overrides,
  };
}

describe("calculateRefiningProfit", () => {
  it("compares refining with and without focus", () => {
    const result = calculateRefiningProfit(baseInput());

    expect(result.withoutFocus.netProfit).toBe(12_450n);
    expect(result.withFocus.netProfit).toBe(15_850n);
    expect(result.extraProfitFromFocus).toBe(3_400n);
    expect(result.profitPerFocus).toBe(2);
  });

  it("calculates a max primary material price for a target ROI", () => {
    const result = calculateRefiningProfit(
      baseInput({
        targetRoiBasisPoints: 1000,
      }),
    );

    expect(result.primaryMaterialItemId).toBe("T4_HIDE");
    expect(result.maxPrimaryMaterialUnitPrice).toBe(233n);
  });
});
