import { describe, expect, it } from "vitest";
import { repriceMarketOpportunity } from "./reprice-market-opportunity";

const row = {
  investment: "950", marketValue: "1000", grossRevenue: "1000", netProfit: "10", taxes: "40", setupFees: "0",
  roiBasisPoints: 105, profitPerKgSilver: 10, totalWeightGrams: 1000, recommendedQuantity: 10,
  warnings: ["Quantity unknown"], isProfitable: true,
};
describe("local Premium repricing", () => {
  it("updates warnings and profitability in both directions without stale net profit", () => {
    const nonPremium = repriceMarketOpportunity(row, false, "FAST_SELL");
    expect(nonPremium).toMatchObject({ netProfit: "-30", taxes: "80", isProfitable: false });
    expect(nonPremium.warnings).toEqual(["Quantity unknown", "Expected profit is not positive"]);
    expect(repriceMarketOpportunity(nonPremium, true, "FAST_SELL")).toMatchObject({ netProfit: "10", isProfitable: true, warnings: ["Quantity unknown"] });
  });
  it.each([0, -1, 0.5, NaN, Infinity])("does not invent profit for invalid quantity %s", (recommendedQuantity) => {
    expect(repriceMarketOpportunity({ ...row, recommendedQuantity }, true, "FAST_SELL")).toMatchObject({ netProfit: "0", isProfitable: false, roiBasisPoints: null });
  });
  it("uses canonical revenue with bigint fee rounding", () => {
    const grossRevenue = "90071992547409931";
    const result = repriceMarketOpportunity({ ...row, grossRevenue, marketValue: "1" }, false, "SELL_ORDER");
    expect(result.taxes).toBe((BigInt(grossRevenue) * 800n / 10000n).toString());
    expect(result.setupFees).toBe((BigInt(grossRevenue) * 250n / 10000n).toString());
  });
});
