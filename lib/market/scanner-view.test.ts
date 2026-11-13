import { describe, expect, it } from "vitest";
import { meetsScannerThresholds, rankProgressiveOpportunities, type Opportunity } from "./scanner-view";

export const row: Opportunity = {
  itemId: "T4_BAG", itemName: "Bag", category: "Bags", quality: 1,
  sourceCity: "BRIDGEWATCH", destinationCity: "Black Market",
  purchasePrice: "100", expectedSalePrice: "110", recommendedQuantity: 10,
  investment: "1000", marketValue: "1100", taxes: "44", setupFees: "0", netProfit: "56",
  roiBasisPoints: 560, profitPerKgSilver: 56, sourcePriceAgeMinutes: 1, destinationPriceAgeMinutes: 2,
  score: 1, confidence: "MEDIUM", warnings: ["Quantity unknown"], purchasePriceSource: "PUBLIC", salePriceSource: "PUBLIC",
};
describe("scanner view", () => {
  it("compares exact silver per unit instead of total profit", () => {
    expect(meetsScannerThresholds(row, 6n, 0, 60, 60)).toBe(false);
    expect(meetsScannerThresholds({ ...row, netProfit: "60" }, 6n, 0, 60, 60)).toBe(true);
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid quantity %s", (recommendedQuantity) => {
    expect(meetsScannerThresholds({ ...row, recommendedQuantity }, 0n, 0, 60, 60)).toBe(false);
  });
  it("keeps negative fractions below a zero per-unit minimum", () => {
    expect(meetsScannerThresholds({ ...row, netProfit: "-1", roiBasisPoints: 0 }, 0n, 0, 60, 60)).toBe(false);
  });
  it("requires positive profit even with zero profit and ROI minimums", () => {
    expect(meetsScannerThresholds({ ...row, netProfit: "0", roiBasisPoints: 0 }, 0n, 0, 60, 60)).toBe(false);
    expect(meetsScannerThresholds({ ...row, netProfit: "1", roiBasisPoints: 0 }, 0n, 0, 60, 60)).toBe(true);
  });
  it("preserves bigint precision at the threshold and when sorting", () => {
    const a = { ...row, netProfit: "90071992547409930" };
    expect(meetsScannerThresholds(a, 9007199254740993n, 0, 60, 60)).toBe(true);
    expect(meetsScannerThresholds({ ...a, netProfit: "90071992547409929" }, 9007199254740993n, 0, 60, 60)).toBe(false);
    const b = { ...a, itemId: "B", netProfit: "90071992547409931" };
    expect(rankProgressiveOpportunities([a, b], "profit", 60, 60, "desc").map(x => x.itemId)).toEqual(["B", "T4_BAG"]);
    expect(rankProgressiveOpportunities([], "combined", 60, 60, "asc")).toEqual([]);
  });
  it("rejects missing ages and insufficient ROI", () => {
    expect(meetsScannerThresholds({ ...row, sourcePriceAgeMinutes: null }, 0n, 0, 60, 60)).toBe(false);
    expect(meetsScannerThresholds({ ...row, destinationPriceAgeMinutes: null }, 0n, 0, 60, 60)).toBe(false);
    expect(meetsScannerThresholds(row, 0n, 561, 60, 60)).toBe(false);
  });
  it("ranks a full all-quality pool without an argument-stack overflow", () => {
    const ordinary = Object.freeze({ ...row });
    const best = Object.freeze({ ...row, itemId: "BEST", netProfit: "90071992547409931", marketValue: "90071992547409932", roiBasisPoints: 10_000 });
    const items = Array.from({ length: 150_000 }, () => ordinary);
    items[items.length - 1] = best;
    const ranked = rankProgressiveOpportunities(items, "combined", 60, 60, "desc");
    expect(ranked).toHaveLength(150_000);
    expect(ranked[0]).toMatchObject({ itemId: "BEST", netProfit: "90071992547409931" });
    expect(ranked.every(item => Number.isFinite(item.score))).toBe(true);
    expect(items[0]).toBe(ordinary);
    expect(items[items.length - 1]).toBe(best);
    expect(best.score).toBe(row.score);
    expect(ordinary.score).toBe(row.score);
  });
  it("keeps a 20,000-row combined ranking quick", () => {
    const items = Array.from({ length: 20_000 }, () => row);
    const started = performance.now();
    expect(rankProgressiveOpportunities(items, "combined", 60, 60, "desc")).toHaveLength(20_000);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
