import { describe, expect, it } from "vitest";
import { buildCoverageQueue } from "./coverage";

describe("market collection coverage", () => {
  it("prioritizes a missing Black Market recipe material", () => {
    const result = buildCoverageQueue({
      items: [{ id: "T4_LEATHER", name: "Worked Leather", tier: 4 }],
      prices: [],
      recipeIngredients: new Set(["T4_LEATHER"]),
      recipeOutputs: new Set(),
      now: new Date("2026-08-11T10:00:00Z"), maxAgeMinutes: 60, limit: 10,
    });
    expect(result.queue[0]).toEqual(expect.objectContaining({ city: "BLACK_MARKET", priority: 260, status: "MISSING" }));
    expect(result.missingRows).toBe(7);
  });

  it("does not queue a fresh required market side", () => {
    const result = buildCoverageQueue({
      items: [{ id: "T4_BAG", name: "Adept's Bag", tier: 4 }],
      prices: [{ itemId: "T4_BAG", city: "BLACK_MARKET", buyPriceMax: 2000n, buyPriceMaxDate: new Date("2026-08-11T09:30:00Z"), sellPriceMin: null, sellPriceMinDate: null }],
      recipeIngredients: new Set(), recipeOutputs: new Set(["T4_BAG"]),
      now: new Date("2026-08-11T10:00:00Z"), maxAgeMinutes: 60, limit: 10,
    });
    expect(result.queue.some((row) => row.city === "BLACK_MARKET")).toBe(false);
    expect(result.freshRows).toBe(1);
  });
});
