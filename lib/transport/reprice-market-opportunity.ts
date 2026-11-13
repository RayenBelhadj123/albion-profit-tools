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
  grossRevenue?: string;
  recommendedQuantity: number;
  warnings: string[];
  isProfitable?: boolean;
  routeDurationMinutes?: number | null;
  profitPerMinuteSilver?: number | null;
}>(opportunity: T, isPremium: boolean, saleMethod: MarketSaleMethod): T {
  const validQuantity = Number.isSafeInteger(opportunity.recommendedQuantity) && opportunity.recommendedQuantity > 0;
  const grossRevenue = validQuantity ? BigInt(opportunity.grossRevenue ?? opportunity.marketValue) : 0n;
  const investment = validQuantity ? BigInt(opportunity.investment) : 0n;
  const { salesTaxBasisPoints, setupFeeBasisPoints } = getMarketFeeRates({ isPremium, saleMethod });
  const taxes = (grossRevenue * BigInt(salesTaxBasisPoints)) / 10_000n;
  const setupFees = (grossRevenue * BigInt(setupFeeBasisPoints)) / 10_000n;
  const netProfit = grossRevenue - investment - taxes - setupFees;
  const roiBasisPoints = investment > 0n ? Number((netProfit * 10_000n) / investment) : null;
  const weightGrams = opportunity.totalWeightGrams;
  const profitPerKgSilver = validQuantity && weightGrams && Number.isSafeInteger(weightGrams) && weightGrams > 0
    ? Number((netProfit * 1_000n) / BigInt(weightGrams))
    : null;
  const warnings = opportunity.warnings.filter((warning) => warning !== "Expected profit is not positive");
  if (netProfit <= 0n) warnings.push("Expected profit is not positive");
  const duration = opportunity.routeDurationMinutes;
  return {
    ...opportunity,
    taxes: taxes.toString(),
    setupFees: setupFees.toString(),
    netProfit: netProfit.toString(),
    roiBasisPoints,
    profitPerKgSilver,
    profitPerMinuteSilver: validQuantity && duration && Number.isSafeInteger(duration) && duration > 0
      ? Number(netProfit / BigInt(duration)) : null,
    isProfitable: validQuantity && netProfit > 0n,
    warnings,
  };
}
