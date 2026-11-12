export const COVERAGE_ROYAL_CITIES = [
  "BRIDGEWATCH", "CAERLEON", "FORT_STERLING", "LYMHURST", "MARTLOCK", "THETFORD",
] as const;

type CoverageItem = { id: string; name: string | null; tier: number | null };
type CoveragePrice = {
  itemId: string; city: string;
  sellPriceMin: bigint | null; sellPriceMinDate: Date | null;
  buyPriceMax: bigint | null; buyPriceMaxDate: Date | null;
};

export function buildCoverageQueue(input: {
  items: CoverageItem[];
  prices: CoveragePrice[];
  recipeOutputs: Set<string>;
  recipeIngredients: Set<string>;
  now: Date;
  maxAgeMinutes: number;
  limit: number;
}) {
  const priceByMarket = new Map(input.prices.map((row) => [`${row.itemId}\u0000${row.city}`, row]));
  const queue = input.items.flatMap((item) => {
    const targets = [
      ...COVERAGE_ROYAL_CITIES.map((city) => ({ city, orderType: "SELL" as const })),
      { city: "BLACK_MARKET", orderType: "BUY" as const },
    ];
    return targets.flatMap((target) => {
      const row = priceByMarket.get(`${item.id}\u0000${target.city}`);
      const observedAt = target.orderType === "SELL" ? row?.sellPriceMinDate ?? null : row?.buyPriceMaxDate ?? null;
      const price = target.orderType === "SELL" ? row?.sellPriceMin ?? null : row?.buyPriceMax ?? null;
      const ageMinutes = observedAt ? Math.max(0, Math.floor((input.now.getTime() - observedAt.getTime()) / 60_000)) : null;
      if (price !== null && ageMinutes !== null && ageMinutes <= input.maxAgeMinutes) return [];
      const status = price === null || observedAt === null ? "MISSING" as const : "STALE" as const;
      const reasons = [];
      let priority = status === "MISSING" ? 100 : 50 + Math.min(50, Math.floor((ageMinutes ?? 0) / input.maxAgeMinutes));
      if (target.city === "BLACK_MARKET") { priority += 100; reasons.push("Black Market target"); }
      if (input.recipeIngredients.has(item.id)) { priority += 60; reasons.push("Crafting/refining material"); }
      if (input.recipeOutputs.has(item.id)) { priority += 40; reasons.push("Crafting/refining output"); }
      if (reasons.length === 0) reasons.push("Transport catalog");
      return [{
        itemId: item.id,
        itemName: item.name ?? item.id,
        tier: item.tier,
        city: target.city,
        orderType: target.orderType,
        status,
        lastPrice: price,
        lastObservedAt: observedAt,
        ageMinutes,
        priority,
        reasons,
      }];
    });
  }).sort((left, right) => right.priority - left.priority || left.itemName.localeCompare(right.itemName));

  const expectedRows = input.items.length * (COVERAGE_ROYAL_CITIES.length + 1);
  return {
    queue: queue.slice(0, input.limit),
    expectedRows,
    freshRows: expectedRows - queue.length,
    missingRows: queue.filter((row) => row.status === "MISSING").length,
    staleRows: queue.filter((row) => row.status === "STALE").length,
    coverageBasisPoints: expectedRows === 0 ? 0 : Math.floor(((expectedRows - queue.length) * 10_000) / expectedRows),
  };
}
