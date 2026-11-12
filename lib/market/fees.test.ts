import { describe, expect, it } from "vitest";

import { getMarketFeeRates } from "./fees";

describe("Albion market fee rates", () => {
  it.each([
    { isPremium: true, saleMethod: "FAST_SELL" as const, salesTaxBasisPoints: 400, setupFeeBasisPoints: 0, totalFeeBasisPoints: 400 },
    { isPremium: false, saleMethod: "FAST_SELL" as const, salesTaxBasisPoints: 800, setupFeeBasisPoints: 0, totalFeeBasisPoints: 800 },
    { isPremium: true, saleMethod: "SELL_ORDER" as const, salesTaxBasisPoints: 400, setupFeeBasisPoints: 250, totalFeeBasisPoints: 650 },
    { isPremium: false, saleMethod: "SELL_ORDER" as const, salesTaxBasisPoints: 800, setupFeeBasisPoints: 250, totalFeeBasisPoints: 1050 },
  ])("calculates $saleMethod fees when premium is $isPremium", (input) => {
    expect(getMarketFeeRates(input)).toEqual({
      salesTaxBasisPoints: input.salesTaxBasisPoints,
      setupFeeBasisPoints: input.setupFeeBasisPoints,
      totalFeeBasisPoints: input.totalFeeBasisPoints,
    });
  });
});
