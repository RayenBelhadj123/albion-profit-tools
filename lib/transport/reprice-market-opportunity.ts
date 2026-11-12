import { getMarketFeeRates, type MarketSaleMethod } from "@/lib/market/fees";

/**
 * Recalculate the fee-sensitive figures from a saved Premium snapshot without
 * querying market prices again. Price observations and quantities are unchanged.
 */
export function repriceMarketOpportunity<T extends {
  investment: string;
  marketValue: string;
  netProfit: string;
  taxes: string;
  setupFees: string;
  roiBasisPoints: number | null;
  profitPerKgSilver: number | null;
  totalWeightGrams?: number | null;
}>(opportunity: T, isPremium: boolean, saleMethod: MarketSaleMethod): T {
  const grossRevenue = BigInt(opportunity.marketValue);
  const investment = BigInt(opportunity.investment);
  const { salesTaxBasisPoints, setupFeeBasisPoints } = getMarketFeeRates({ isPremium, saleMethod });
  const taxes = (grossRevenue * BigInt(salesTaxBasisPoints)) / 10_000n;
  const setupFees = (grossRevenue * BigInt(setupFeeBasisPoints)) / 10_000n;
  const netProfit = grossRevenue - investment - taxes - setupFees;
  const roiBasisPoints = investment > 0n ? Number((netProfit * 10_000n) / investment) : null;
  const weightGrams = opportunity.totalWeightGrams;
  const profitPerKgSilver = weightGrams && weightGrams > 0
    ? Number((netProfit * 1_000n) / BigInt(weightGrams))
    : null;
  return {
    ...opportunity,
    taxes: taxes.toString(),
    setupFees: setupFees.toString(),
    netProfit: netProfit.toString(),
    roiBasisPoints,
    profitPerKgSilver,
  };
}
