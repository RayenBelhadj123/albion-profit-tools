import { beforeAll, describe, expect, it } from "vitest";

import type { PublicMarketPrice } from "./current-prices";

let mergeCurrentAndCachedPrices: typeof import("./market-price-cache")["mergeCurrentAndCachedPrices"];
let toUnifiedPublicObservations: typeof import("./market-price-cache")["toUnifiedPublicObservations"];
let observationsToLastKnownPrices: typeof import("./market-price-cache")["observationsToLastKnownPrices"];

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
  ({ mergeCurrentAndCachedPrices, observationsToLastKnownPrices, toUnifiedPublicObservations } = await import("./market-price-cache"));
});

describe("unified public observation persistence", () => {
  it("creates separate buy and sell facts and ignores zero-normalized sides", () => {
    const fetchedAt = new Date("2026-08-11T10:00:00Z");
    const observations = toUnifiedPublicObservations([{
      itemId: "T4_BAG",
      city: "Bridgewatch",
      quality: 1,
      sellPriceMin: 1200n,
      sellPriceMinDate: new Date("2026-08-11T09:55:00Z"),
      sellPriceMinQuantity: null,
      buyPriceMax: null,
      buyPriceMaxDate: null,
      buyPriceMaxQuantity: null,
      fetchedAt,
    }], "EUROPE");

    expect(observations).toEqual([expect.objectContaining({
      itemId: "T4_BAG",
      city: "BRIDGEWATCH",
      orderType: "SELL",
      price: 1200n,
      source: "LIVE_PUBLIC",
      confidence: "HIGH",
    })]);
  });

  it("reduces confidence as an upstream observation ages", () => {
    const observations = toUnifiedPublicObservations([{
      itemId: "T4_BAG",
      city: "Black Market",
      quality: 1,
      sellPriceMin: null,
      sellPriceMinDate: null,
      sellPriceMinQuantity: null,
      buyPriceMax: 2000n,
      buyPriceMaxDate: new Date("2026-08-09T09:00:00Z"),
      buyPriceMaxQuantity: null,
      fetchedAt: new Date("2026-08-11T10:00:00Z"),
    }], "EUROPE");

    expect(observations[0]?.confidence).toBe("LOW");
  });
});

function price(overrides: Partial<PublicMarketPrice>): PublicMarketPrice {
  return {
    itemId: "T4_BAG",
    city: "Black Market",
    quality: 1,
    sellPriceMin: null,
    sellPriceMinDate: null,
    sellPriceMinQuantity: null,
    buyPriceMax: null,
    buyPriceMaxDate: null,
    buyPriceMaxQuantity: null,
    fetchedAt: new Date("2026-08-10T12:00:00Z"),
    ...overrides,
  };
}

describe("last-known public market price fallback", () => {
  it("reconstructs newest buy and sell sides independently from history", () => {
    const reconstructed = observationsToLastKnownPrices([
      { itemId: "T4_BAG", city: "BRIDGEWATCH", quality: 1, orderType: "SELL", price: 1300n, availableQuantity: 4, observedAt: new Date("2026-08-11T10:00:00Z"), collectedAt: new Date("2026-08-11T10:01:00Z") },
      { itemId: "T4_BAG", city: "BRIDGEWATCH", quality: 1, orderType: "SELL", price: 1200n, availableQuantity: 8, observedAt: new Date("2026-08-11T09:00:00Z"), collectedAt: new Date("2026-08-11T09:01:00Z") },
      { itemId: "T4_BAG", city: "BRIDGEWATCH", quality: 1, orderType: "BUY", price: 1000n, availableQuantity: 2, observedAt: new Date("2026-08-11T09:30:00Z"), collectedAt: new Date("2026-08-11T09:31:00Z") },
    ]);

    expect(reconstructed).toEqual([expect.objectContaining({
      sellPriceMin: 1300n,
      sellPriceMinQuantity: 4,
      sellPriceMinIsFallback: true,
      buyPriceMax: 1000n,
      buyPriceMaxQuantity: 2,
      buyPriceMaxIsFallback: true,
    })]);
  });

  it("fills a missing current price from the cache without changing its timestamp", () => {
    const cachedDate = new Date("2026-08-10T10:00:00Z");
    const [merged] = mergeCurrentAndCachedPrices(
      [price({ fetchedAt: new Date("2026-08-10T12:00:00Z") })],
      [price({
        buyPriceMax: 25_000n,
        buyPriceMaxDate: cachedDate,
        buyPriceMaxIsFallback: true,
      })],
    );

    expect(merged.buyPriceMax).toBe(25_000n);
    expect(merged.buyPriceMaxDate).toEqual(cachedDate);
    expect(merged.buyPriceMaxIsFallback).toBe(true);
  });

  it("prefers a newer current observation over a cached one", () => {
    const currentDate = new Date("2026-08-10T12:00:00Z");
    const [merged] = mergeCurrentAndCachedPrices(
      [price({ buyPriceMax: 30_000n, buyPriceMaxDate: currentDate })],
      [price({
        buyPriceMax: 25_000n,
        buyPriceMaxDate: new Date("2026-08-10T10:00:00Z"),
        buyPriceMaxIsFallback: true,
      })],
    );

    expect(merged.buyPriceMax).toBe(30_000n);
    expect(merged.buyPriceMaxDate).toEqual(currentDate);
    expect(merged.buyPriceMaxIsFallback).toBe(false);
  });

  it("keeps a cached-only market row", () => {
    const cached = price({
      city: "Bridgewatch",
      sellPriceMin: 20_000n,
      sellPriceMinDate: new Date("2026-08-09T12:00:00Z"),
      sellPriceMinIsFallback: true,
    });

    expect(mergeCurrentAndCachedPrices([], [cached])).toEqual([cached]);
  });

  it("keeps the fallback label when compact cache is newer than history", () => {
    const [merged] = mergeCurrentAndCachedPrices(
      [price({ buyPriceMax: 30_000n, buyPriceMaxDate: new Date("2026-08-11T10:00:00Z"), buyPriceMaxIsFallback: true })],
      [price({ buyPriceMax: 20_000n, buyPriceMaxDate: new Date("2026-08-11T09:00:00Z"), buyPriceMaxIsFallback: true })],
    );

    expect(merged.buyPriceMax).toBe(30_000n);
    expect(merged.buyPriceMaxIsFallback).toBe(true);
  });
});
