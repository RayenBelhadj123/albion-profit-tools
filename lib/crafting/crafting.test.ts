import { describe, expect, it } from "vitest";

import {
  calculateCraftingProfit,
  compareFocusCraftingProfit,
} from "./crafting";
import type { CraftingCalculationInput, CraftingSelectedPrice } from "./types";

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
  overrides: Partial<CraftingCalculationInput> = {},
): CraftingCalculationInput {
  return {
    outputItemId: "T4_BAG",
    outputQuality: 1,
    outputQuantityPerRun: 1,
    runs: 10,
    outputUnitPrice: price(2_000n),
    outputWeightGrams: 750,
    ingredients: [
      {
        itemId: "T4_LEATHER",
        quantityPerRun: 16,
        unitPrice: price(100n),
        weightGrams: 100,
      },
      {
        itemId: "T4_CLOTH",
        quantityPerRun: 8,
        unitPrice: price(50n),
        weightGrams: 50,
      },
    ],
    resourceReturnRateBasisPoints: 1870,
    focusCost: null,
    stationFeePer100Nutrition: 500n,
    nutritionPerRun: 12,
    taxRateBasisPoints: 650,
    setupFeeSilver: 1_000n,
    now,
    maxDataAgeMinutes: 60,
    ...overrides,
  };
}

describe("calculateCraftingProfit", () => {
  it("calculates direct crafting profit with resource returns and station fees", () => {
    const result = calculateCraftingProfit(baseInput());

    expect(result.outputQuantity).toBe(10);
    expect(result.materialCost).toBe(20_000n);
    expect(result.returnedMaterialValue).toBe(3_600n);
    expect(result.netMaterialCost).toBe(16_400n);
    expect(result.stationFee).toBe(600n);
    expect(result.grossRevenue).toBe(20_000n);
    expect(result.taxes).toBe(1_300n);
    expect(result.setupFees).toBe(1_000n);
    expect(result.investment).toBe(18_000n);
    expect(result.netProfit).toBe(700n);
    expect(result.roiBasisPoints).toBe(388);
    expect(result.inputWeightGrams).toBe(20_000);
    expect(result.outputWeightGrams).toBe(7_500);
    expect(result.confidence).toBe("MEDIUM");
    expect(result.warnings).toContain("Focus cost missing");
  });

  it("marks missing material prices as low confidence", () => {
    const result = calculateCraftingProfit(
      baseInput({
        ingredients: [
          {
            itemId: "T4_LEATHER",
            quantityPerRun: 16,
            unitPrice: {
              price: null,
              source: "PUBLIC",
              observedAt: null,
              availableQuantity: null,
              warnings: [],
            },
            weightGrams: 100,
          },
        ],
      }),
    );

    expect(result.materialCost).toBe(0n);
    expect(result.warnings).toContain("Material price missing");
    expect(result.confidence).toBe("LOW");
  });

  it("marks stale output price", () => {
    const result = calculateCraftingProfit(
      baseInput({
        outputUnitPrice: {
          ...price(2_000n),
          observedAt: new Date("2026-08-06T10:00:00Z"),
        },
      }),
    );

    expect(result.warnings).toContain("Output price is stale");
    expect(result.confidence).toBe("LOW");
  });

  it("supports ingredients that do not receive resource returns", () => {
    const result = calculateCraftingProfit(
      baseInput({
        ingredients: [
          {
            itemId: "T4_RUNE",
            quantityPerRun: 2,
            unitPrice: price(100n),
            weightGrams: 1,
            receivesReturn: false,
          },
        ],
      }),
    );

    expect(result.ingredients[0]?.quantityRequired).toBe(20);
    expect(result.ingredients[0]?.quantityReturned).toBe(0);
    expect(result.returnedMaterialValue).toBe(0n);
  });

  it("marks losing crafts", () => {
    const result = calculateCraftingProfit(
      baseInput({
        outputUnitPrice: price(1_000n),
      }),
    );

    expect(result.isProfitable).toBe(false);
    expect(result.warnings).toContain("Expected profit is not positive");
  });

  it("calculates a percentage sell-order setup fee from gross revenue", () => {
    const result = calculateCraftingProfit(
      baseInput({ setupFeeSilver: 0n, setupFeeRateBasisPoints: 250 }),
    );

    expect(result.setupFees).toBe(500n);
    expect(result.investment).toBe(17_500n);
    expect(result.netProfit).toBe(1_200n);
  });
});

describe("compareFocusCraftingProfit", () => {
  it("compares no-focus and focus return rates", () => {
    const result = compareFocusCraftingProfit({
      ...baseInput(),
      noFocusReturnRateBasisPoints: 1870,
      focusReturnRateBasisPoints: 4500,
      focusCost: 300,
    });

    expect(result.withoutFocus.netProfit).toBe(700n);
    expect(result.withFocus.returnedMaterialValue).toBe(9_000n);
    expect(result.withFocus.netProfit).toBe(6_100n);
    expect(result.extraProfitFromFocus).toBe(5_400n);
    expect(result.profitPerFocus).toBe(18);
    expect(result.withFocus.profitPerFocus).toBe(18);
  });

  it("warns when focus cost is missing", () => {
    const result = compareFocusCraftingProfit({
      ...baseInput(),
      noFocusReturnRateBasisPoints: 1870,
      focusReturnRateBasisPoints: 4500,
      focusCost: null,
    });

    expect(result.profitPerFocus).toBeNull();
    expect(result.warnings).toContain("Focus cost missing");
  });
});
