import { describe, expect, it } from "vitest";

import { calculateTransportOpportunity } from "./opportunity";
import type { OpportunityInput, SelectedMarketPrice } from "./types";

const now = new Date("2026-08-06T12:00:00Z");

function selectedPrice(
  price: bigint,
  source: SelectedMarketPrice["source"] = "PRIVATE_MANUAL",
  availableQuantity: number | null = 100,
): SelectedMarketPrice {
  return {
    price,
    source,
    availableQuantity,
    observedAt: new Date("2026-08-06T11:55:00Z"),
    warnings: [],
  };
}

function input(overrides: Partial<OpportunityInput> = {}): OpportunityInput {
  return {
    itemId: "T4_BAG",
    quality: 1,
    sourceCity: "Bridgewatch",
    destinationCity: "Caerleon",
    purchasePrice: selectedPrice(2_500n),
    expectedSalePrice: selectedPrice(3_100n),
    itemWeightGrams: 1200,
    availableCapital: 1_000_000n,
    carryingCapacityGrams: 120_000,
    taxRateBasisPoints: 650,
    setupFeeSilver: 0n,
    routeDurationMinutes: 20,
    now,
    maxDataAgeMinutes: 60,
    ...overrides,
  };
}

describe("calculateTransportOpportunity", () => {
  it("calculates quantity, profit, roi, profit per kg, and profit per minute", () => {
    const opportunity = calculateTransportOpportunity(input());

    expect(opportunity.recommendedQuantity).toBe(100);
    expect(opportunity.investment).toBe(250_000n);
    expect(opportunity.grossRevenue).toBe(310_000n);
    expect(opportunity.taxes).toBe(20_150n);
    expect(opportunity.netProfit).toBe(39_850n);
    expect(opportunity.roiBasisPoints).toBe(1594);
    expect(opportunity.profitPerKgSilver).toBe(332);
    expect(opportunity.profitPerMinuteSilver).toBe(1992);
    expect(opportunity.confidence).toBe("HIGH");
  });

  it("limits quantity by available capital", () => {
    const opportunity = calculateTransportOpportunity(
      input({
        availableCapital: 25_000n,
      }),
    );

    expect(opportunity.recommendedQuantity).toBe(10);
    expect(opportunity.maximumAffordableQuantity).toBe(10);
  });

  it("applies a percentage setup fee separately from sales tax", () => {
    const opportunity = calculateTransportOpportunity(input({
      taxRateBasisPoints: 400,
      setupFeeRateBasisPoints: 250,
    }));

    expect(opportunity.taxes).toBe(12_400n);
    expect(opportunity.setupFees).toBe(7_750n);
    expect(opportunity.netProfit).toBe(39_850n);
  });

  it("can recommend by market quantity and carrying capacity without a capital limit", () => {
    const opportunity = calculateTransportOpportunity(
      input({
        availableCapital: null,
        purchasePrice: selectedPrice(2_500n, "PUBLIC", 80),
      }),
    );

    expect(opportunity.recommendedQuantity).toBe(80);
    expect(opportunity.maximumAffordableQuantity).toBe(Number.MAX_SAFE_INTEGER);
    expect(opportunity.warnings).not.toContain("Insufficient capital");
  });

  it("limits quantity by carrying capacity", () => {
    const opportunity = calculateTransportOpportunity(
      input({
        carryingCapacityGrams: 12_000,
      }),
    );

    expect(opportunity.recommendedQuantity).toBe(10);
    expect(opportunity.maximumCarryableQuantity).toBe(10);
  });

  it("plans multiple units from both silver and carrying capacity", () => {
    const opportunity = calculateTransportOpportunity(input({
      purchasePrice: selectedPrice(2_500n, "PUBLIC", null),
      availableCapital: 50_000n,
      carryingCapacityGrams: 12_000,
      userMaximumQuantity: null,
    }));

    expect(opportunity.maximumAffordableQuantity).toBe(20);
    expect(opportunity.maximumCarryableQuantity).toBe(10);
    expect(opportunity.recommendedQuantity).toBe(10);
    expect(opportunity.investment).toBe(25_000n);
    expect(opportunity.warnings).toContain("Quantity unknown");
  });

  it("reduces confidence when quantity is unknown", () => {
    const opportunity = calculateTransportOpportunity(
      input({
        purchasePrice: selectedPrice(2_500n, "PUBLIC", null),
      }),
    );

    expect(opportunity.warnings).toContain("Quantity unknown");
    expect(opportunity.confidence).toBe("MEDIUM");
  });

  it("keeps a historical estimate visible but rates it low confidence", () => {
    const historicalPrice = selectedPrice(2_500n, "CALCULATED", null);
    historicalPrice.warnings = ["Historical average price estimate"];
    const opportunity = calculateTransportOpportunity(input({ purchasePrice: historicalPrice }));

    expect(opportunity.isProfitable).toBe(true);
    expect(opportunity.warnings).toContain("Historical average price estimate");
    expect(opportunity.warnings).toContain("Quantity unknown");
    expect(opportunity.confidence).toBe("LOW");
  });

  it("returns a low-confidence empty result when sale price is missing", () => {
    const opportunity = calculateTransportOpportunity(
      input({
        expectedSalePrice: {
          price: null,
          source: "PUBLIC",
          availableQuantity: null,
          observedAt: null,
          warnings: [],
        },
      }),
    );

    expect(opportunity.recommendedQuantity).toBe(0);
    expect(opportunity.warnings).toContain("Destination price missing");
    expect(opportunity.confidence).toBe("LOW");
  });

  it("marks losing opportunities as not profitable", () => {
    const opportunity = calculateTransportOpportunity(
      input({
        expectedSalePrice: selectedPrice(2_550n),
      }),
    );

    expect(opportunity.isProfitable).toBe(false);
    expect(opportunity.warnings).toContain("Expected profit is not positive");
  });
});
