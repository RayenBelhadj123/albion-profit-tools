import { describe, expect, it, vi } from "vitest";

import {
  AlbionApiError,
  buildCurrentPricesUrl,
  fetchCurrentPrices,
  fetchCurrentPricesBatched,
  fetchCurrentPricesFast,
} from "./current-prices";

describe("Albion current price client", () => {
  it("builds current price URLs for selected server, cities, and qualities", () => {
    const url = buildCurrentPricesUrl({
      server: "EUROPE",
      itemIds: ["T4_BAG", "T5_HIDE"],
      locations: ["Bridgewatch", "Caerleon"],
      qualities: [1, 2],
    });

    expect(url).toBe(
      "https://europe.albion-online-data.com/api/v2/stats/prices/T4_BAG,T5_HIDE.json?locations=Bridgewatch%2CCaerleon&qualities=1%2C2",
    );
  });

  it("normalizes zero prices as missing data", async () => {
    const fetcher = vi.fn(async () =>
      Response.json([
        {
          item_id: "T4_BAG",
          city: "Bridgewatch",
          quality: 1,
          sell_price_min: 0,
          sell_price_min_date: "0001-01-01T00:00:00",
          sell_price_max: 0,
          sell_price_max_date: "0001-01-01T00:00:00",
          buy_price_min: 1200,
          buy_price_min_date: "2026-08-06T12:00:00",
          buy_price_max: 1500,
          buy_price_max_date: "2026-08-06T12:05:00",
        },
      ]),
    );

    const prices = await fetchCurrentPrices(
      {
        server: "EUROPE",
        itemIds: ["T4_BAG"],
        locations: ["Bridgewatch"],
      },
      {
        fetcher,
        now: () => new Date("2026-08-06T12:10:00Z"),
      },
    );

    expect(prices).toEqual([
      {
        itemId: "T4_BAG",
        city: "Bridgewatch",
        quality: 1,
        sellPriceMin: null,
        sellPriceMinDate: null,
        sellPriceMinQuantity: null,
        buyPriceMax: 1500n,
        buyPriceMaxDate: new Date("2026-08-06T12:05:00Z"),
        buyPriceMaxQuantity: null,
        fetchedAt: new Date("2026-08-06T12:10:00Z"),
      },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("throws a typed error for non-ok responses", async () => {
    const fetcher = vi.fn(async () => new Response("Nope", { status: 503 }));

    await expect(
      fetchCurrentPrices(
        {
          server: "EUROPE",
          itemIds: ["T4_BAG"],
          locations: ["Bridgewatch"],
        },
        { fetcher },
      ),
    ).rejects.toMatchObject({
      name: "AlbionApiError",
      status: 503,
    });
  });

  it("rejects empty item lists before making a request", async () => {
    await expect(
      fetchCurrentPrices({
        server: "EUROPE",
        itemIds: [],
        locations: ["Bridgewatch"],
      }),
    ).rejects.toThrow(AlbionApiError);
  });

  it("keeps successful batches when partial scanning is enabled", async () => {
    const progress: Array<{ completedBatches: number; totalBatches: number; itemCount: number }> = [];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            item_id: "T4_BAG",
            city: "Bridgewatch",
            quality: 1,
            sell_price_min: 1000,
            sell_price_min_date: "2026-08-06T12:00:00",
            sell_price_max: 0,
            sell_price_max_date: "0001-01-01T00:00:00",
            buy_price_min: 0,
            buy_price_min_date: "0001-01-01T00:00:00",
            buy_price_max: 1200,
            buy_price_max_date: "2026-08-06T12:00:00",
          },
        ]),
      )
      .mockResolvedValue(new Response("Temporary upstream failure", { status: 503 }));

    const prices = await fetchCurrentPricesBatched(
      {
        server: "EUROPE",
        itemIds: Array.from(
          { length: 76 },
          (_, index) => `T4_TEST_${index}_${"X".repeat(80)}`,
        ),
        locations: ["Bridgewatch"],
      },
      {
        fetcher,
        allowPartial: true,
        onBatch: (batch) => {
          progress.push({
            completedBatches: batch.completedBatches,
            totalBatches: batch.totalBatches,
            itemCount: batch.itemIds.length,
          });
        },
      },
    );

    expect(prices).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(progress).toHaveLength(2);
    expect(progress.map((batch) => batch.totalBatches)).toEqual([2, 2]);
    expect(progress.reduce((total, batch) => total + batch.itemCount, 0)).toBe(76);
  });

  it("keeps request batches within the reliable 75-item endpoint size", async () => {
    const fetcher = vi.fn(async () => Response.json([]));

    await fetchCurrentPricesBatched(
      {
        server: "EUROPE",
        itemIds: Array.from({ length: 151 }, (_, index) => `T4_TEST_${index}`),
        locations: ["Bridgewatch"],
      },
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("surfaces rate limiting even when other partial failures are allowed", async () => {
    const fetcher = vi.fn(async () => new Response("Throttled", { status: 429 }));

    await expect(
      fetchCurrentPricesBatched(
        {
          server: "EUROPE",
          itemIds: ["T4_BAG"],
          locations: ["Bridgewatch"],
        },
        { fetcher, allowPartial: true },
      ),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("does not report a successful scan when every batch fails", async () => {
    const fetcher = vi.fn(async () => new Response("Unavailable", { status: 503 }));

    await expect(
      fetchCurrentPricesBatched(
        {
          server: "EUROPE",
          itemIds: ["T4_BAG"],
          locations: ["Bridgewatch"],
        },
        { fetcher, allowPartial: true },
      ),
    ).rejects.toThrow("did not return any price batches");
  });

  it("reuses cached batches with original timestamps and refetches after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    try {
      const fetcher = vi.fn(async () => Response.json([{
        item_id: "T4_CACHE_TEST",
        city: "Black Market",
        quality: 1,
        sell_price_min: 0,
        sell_price_min_date: "0001-01-01T00:00:00",
        sell_price_max: 0,
        sell_price_max_date: "0001-01-01T00:00:00",
        buy_price_min: 0,
        buy_price_min_date: "0001-01-01T00:00:00",
        buy_price_max: 1500,
        buy_price_max_date: "2026-08-06T11:55:00Z",
      }]));
      const request = {
        server: "EUROPE" as const,
        itemIds: ["T4_CACHE_TEST"],
        locations: ["Black Market" as const],
      };
      const cacheHits: boolean[] = [];

      const first = await fetchCurrentPricesBatched(request, {
        fetcher,
        cacheTtlMs: 60_000,
        now: () => new Date("2026-08-06T12:00:00Z"),
        onBatch: (batch) => { cacheHits.push(batch.fromCache); },
      });
      const second = await fetchCurrentPricesBatched(request, {
        fetcher,
        cacheTtlMs: 60_000,
        now: () => new Date("2026-08-06T12:00:30Z"),
        onBatch: (batch) => { cacheHits.push(batch.fromCache); },
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cacheHits).toEqual([false, true]);
      expect(second[0].fetchedAt).toEqual(first[0].fetchedAt);

      vi.advanceTimersByTime(60_001);
      await fetchCurrentPricesBatched(request, { fetcher, cacheTtlMs: 60_000 });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares an in-flight batch while allowing one caller to cancel independently", async () => {
    let completeFetch: ((response: Response) => void) | undefined;
    const pendingResponse = new Promise<Response>((resolve) => { completeFetch = resolve; });
    const fetcher = vi.fn(() => pendingResponse);
    const request = {
      server: "EUROPE" as const,
      itemIds: ["T4_SHARED_TEST"],
      locations: ["Black Market" as const],
    };
    const firstController = new AbortController();
    const cacheSignals: boolean[] = [];

    const first = fetchCurrentPricesBatched(request, {
      fetcher,
      cacheTtlMs: 60_000,
      signal: firstController.signal,
    });
    const second = fetchCurrentPricesBatched(request, {
      fetcher,
      cacheTtlMs: 60_000,
      onBatch: (batch) => { cacheSignals.push(batch.fromCache); },
    });

    firstController.abort();
    completeFetch?.(Response.json([{
      item_id: "T4_SHARED_TEST",
      city: "Black Market",
      quality: 1,
      sell_price_min: 0,
      sell_price_min_date: "0001-01-01T00:00:00",
      sell_price_max: 0,
      sell_price_max_date: "0001-01-01T00:00:00",
      buy_price_min: 0,
      buy_price_min_date: "0001-01-01T00:00:00",
      buy_price_max: 1800,
      buy_price_max_date: "2026-08-06T12:00:00Z",
    }]));

    await expect(first).rejects.toThrow("cancelled");
    await expect(second).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheSignals).toEqual([true]);
  });

  it("reuses small calculator requests without another upstream call", async () => {
    const fetcher = vi.fn(async () => Response.json([]));
    const request = {
      server: "EUROPE" as const,
      itemIds: ["T4_MEAL_STEW"],
      locations: ["Caerleon" as const],
      qualities: [1],
    };

    await fetchCurrentPricesFast(request, { fetcher });
    await fetchCurrentPricesFast(request, { fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
