export type MarketSaleMethod = "FAST_SELL" | "SELL_ORDER";

const PREMIUM_SALES_TAX_BASIS_POINTS = 400;
const STANDARD_SALES_TAX_BASIS_POINTS = 800;
const SELL_ORDER_SETUP_FEE_BASIS_POINTS = 250;

export function getMarketFeeRates(input: {
  isPremium: boolean;
  saleMethod: MarketSaleMethod;
}) {
  const salesTaxBasisPoints = input.isPremium
    ? PREMIUM_SALES_TAX_BASIS_POINTS
    : STANDARD_SALES_TAX_BASIS_POINTS;
  const setupFeeBasisPoints = input.saleMethod === "SELL_ORDER"
    ? SELL_ORDER_SETUP_FEE_BASIS_POINTS
    : 0;

  return {
    salesTaxBasisPoints,
    setupFeeBasisPoints,
    totalFeeBasisPoints: salesTaxBasisPoints + setupFeeBasisPoints,
  };
}
