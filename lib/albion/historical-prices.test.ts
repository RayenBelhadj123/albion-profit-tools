import { describe, expect, it, vi } from "vitest";

import { fetchHistoricalSellEstimates, weightedPriceQuantile } from "./historical-prices";

describe("Albion historical sell estimates", () => {
  it("uses the upper median and preserves the newest market timestamp", async () => {
    const fetcher = vi.fn(async () => Response.json([{
      location: "Bridgewatch",
      item_id: "T4_BAG",
      quality: 1,
      data: [
        { item_count: 12, avg_price: 1000, timestamp: "2026-08-07T00:00:00" },
        { item_count: 8, avg_price: 3000, timestamp: "2026-08-08T00:00:00" },
        { item_count: 10, avg_price: 2000, timestamp: "2026-08-09T00:00:00" },
        { item_count: 0, avg_price: 99999, timestamp: "2026-08-10T00:00:00" },
      ],
    }]));

    const result = await fetchHistoricalSellEstimates({
      server: "EUROPE",
      itemIds: ["T4_BAG"],
      locations: ["Bridgewatch"],
      quality: 1,
      fetcher,
    });

    expect(result).toEqual([{
      itemId: "T4_BAG",
      city: "Bridgewatch",
      quality: 1,
      price: 2000n,
      observedAt: new Date("2026-08-09T00:00:00Z"),
      sampleCount: 30,
      strategy: "ORIGIN_COST",
      days: 7,
    }]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/api/v2/stats/history/T4_BAG.json" }),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("uses the lower quartile for a conservative destination revenue estimate", async () => {
    const fetcher = vi.fn(async () => Response.json([{
      location: "Black Market",
      item_id: "T4_BAG",
      quality: 1,
      data: [1000, 2000, 3000, 4000, 5000].map((avg_price, index) => ({
        item_count: 1,
        avg_price,
        timestamp: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00`,
      })),
    }]));

    const result = await fetchHistoricalSellEstimates({
      server: "EUROPE",
      itemIds: ["T4_BAG"],
      locations: ["Black Market"],
      quality: 1,
      strategy: "DESTINATION_REVENUE",
      fetcher,
    });

    expect(result[0]?.price).toBe(2000n);
  });

  it("weights prices by traded volume instead of treating every day equally", () => {
    expect(weightedPriceQuantile([
      { price: 1000, count: 100 },
      { price: 9000, count: 1 },
      { price: 10_000, count: 1 },
    ], 0.6)).toBe(1000);
  });
});
