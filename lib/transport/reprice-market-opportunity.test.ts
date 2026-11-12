import { describe, expect, it } from "vitest";
import { repriceMarketOpportunity } from "./reprice-market-opportunity";

describe("repriceMarketOpportunity", () => {
  const premium = {
    investment: "100000",
    marketValue: "200000",
    taxes: "8000",
    setupFees: "0",
    netProfit: "92000",
    roiBasisPoints: 9200,
    totalWeightGrams: 10000,
    profitPerKgSilver: 9200,
  };

  it("recalculates Premium and non-Premium fees without changing prices", () => {
    const nonPremium = repriceMarketOpportunity(premium, false, "FAST_SELL");
    expect(nonPremium).toMatchObject({
      investment: "100000",
      marketValue: "200000",
      taxes: "16000",
      setupFees: "0",
      netProfit: "84000",
      roiBasisPoints: 8400,
      profitPerKgSilver: 8400,
    });
    expect(premium.netProfit).toBe("92000");
  });

  it("includes order setup fees when listing an item", () => {
    const listed = repriceMarketOpportunity(premium, true, "SELL_ORDER");
    expect(listed.setupFees).toBe("5000");
    expect(listed.netProfit).toBe("87000");
  });

  it("does not invent profit per kg when item weight is missing", () => {
    expect(repriceMarketOpportunity({ ...premium, totalWeightGrams: null }, false, "FAST_SELL").profitPerKgSilver).toBeNull();
  });
});
