import { describe, expect, it, vi } from "vitest";
import { inspectMarket } from "./market-inspector";

const now = new Date("2026-11-12T12:00:00Z");
const input = { itemId: "T4_BAG", server: "EUROPE", city: "Bridgewatch", quality: "1" };
const price = { item_id: "T4_BAG", city: "Bridgewatch", quality: 1, sell_price_min: 120, sell_price_max: 140, buy_price_min: 90, buy_price_max: 100, sell_price_min_date: "2026-11-12T11:30:00", sell_price_max_date: null, buy_price_min_date: null, buy_price_max_date: "2026-11-12T11:20:00" };

describe("database-independent market inspector", () => {
  it("caches history briefly without mixing server, city, item, or quality", async () => {
    let time = now;
    const fetcher = vi.fn(async (url: string | URL | Request) => Response.json(String(url).includes("/history/") ? [] : [price]));
    const options = { fetcher, now: () => time };
    await inspectMarket(input, options);
    expect((await inspectMarket(input, options)).historyFromCache).toBe(true);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/history/"))).toHaveLength(1);
    await inspectMarket({ ...input, quality: "2" }, options);
    await inspectMarket({ ...input, city: "Caerleon" }, options);
    await inspectMarket({ ...input, server: "ASIA" }, options);
    await inspectMarket({ ...input, itemId: "T5_BAG" }, options);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/history/"))).toHaveLength(5);
    time = new Date(now.getTime() + 15 * 60_000 + 1);
    expect((await inspectMarket(input, options)).historyFromCache).toBe(false);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/history/"))).toHaveLength(6);
  });

  it("does not fetch history for a price-only alert check", async () => {
    const fetcher = vi.fn(async () => Response.json([price]));
    const data = await inspectMarket({ ...input, history: "false" }, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(data.history).toEqual([]);
  });

  it("keeps missing prices missing and reports partial upstream failures", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes("/history/") ? new Response("limited", { status: 429 }) : Response.json([{ ...price, sell_price_min: 0, buy_price_max: 0 }]));
    const data = await inspectMarket(input, { fetcher });
    expect(data.listing).toMatchObject({ lowestSell: null, highestBuy: null });
    expect(data.currentError).toBeNull();
    expect(data.historyError).toMatch(/rate limit/);
    expect(data.trend.direction).toBe("INSUFFICIENT");
  });

  it("validates item IDs and forbids arbitrary external hosts before fetching", async () => {
    const fetcher = vi.fn();
    await expect(inspectMarket({ ...input, itemId: "T4_BAG/../../secrets" }, { fetcher })).rejects.toThrow();
    await expect(inspectMarket({ ...input, server: "https://private.invalid" }, { fetcher })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads a selected public listing and sorted daily history without Prisma", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => Response.json(String(url).includes("/history/") ? [{ item_id: "T4_BAG", location: "Bridgewatch", quality: 1, data: [
      { timestamp: "2026-11-12T00:00:00", avg_price: 120, item_count: 3 },
      { timestamp: "2026-11-10T00:00:00", avg_price: 100, item_count: 5 },
      { timestamp: "2026-11-11T00:00:00", avg_price: 110, item_count: 4 },
    ] }] : [price]));
    const data = await inspectMarket(input, { fetcher, now: () => now });
    expect(data.listing).toMatchObject({ lowestSell: "120", highestBuy: "100", sellObservedAt: "2026-11-12T11:30:00.000Z" });
    expect(data.history.map(row => row.averagePrice)).toEqual(["100", "110", "120"]);
    expect(data.trend).toEqual({ direction: "UP", changeBasisPoints: 2000, samples: 3 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
