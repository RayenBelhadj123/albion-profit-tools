import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  items: vi.fn(),
  routes: vi.fn(),
  snapshot: vi.fn(),
  restore: vi.fn(),
  history: vi.fn(),
  cachePrices: vi.fn(),
  loadPrices: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: {
  item: { findMany: mocks.items },
  route: { findMany: mocks.routes },
  blackMarketScanSnapshot: { upsert: mocks.snapshot, findUnique: mocks.restore },
} }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/albion/historical-prices", () => ({ fetchHistoricalSellEstimates: mocks.history }));
vi.mock("@/lib/albion/historical-price-cache", () => ({ cacheHistoricalPriceEstimates: vi.fn() }));
vi.mock("@/lib/albion/market-price-cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/albion/market-price-cache")>(),
  cachePublicMarketPrices: mocks.cachePrices,
  loadCachedPublicMarketPrices: mocks.loadPrices,
}));
vi.mock("@/lib/albion/current-prices", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/albion/current-prices")>();
  // Give each test fetcher an isolated real batch cache; Vitest retains the
  // importOriginal module instance even when the route module is reset.
  return { ...actual, fetchCurrentPricesBatched: vi.fn<typeof actual.fetchCurrentPricesBatched>((request, options) =>
    actual.fetchCurrentPricesBatched(request, { ...options, fetcher: fetch }),
  ) };
});

type CatalogItem = { id: string; name: string | null; weightGrams: number | null };
const state = globalThis as typeof globalThis & {
  blackMarketCatalog?: { expiresAt: number; items: CatalogItem[] };
  blackMarketCompletedScans?: Map<string, unknown>;
};
const catalog = (ids: string[]): CatalogItem[] => ids.map((id) => ({ id, name: id, weightGrams: 100 }));
const request = (query: string, init?: RequestInit) => new Request(`http://localhost/api/black-market-flips?${query}`, init);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete state.blackMarketCatalog;
  state.blackMarketCompletedScans?.clear();
  mocks.items.mockResolvedValue(catalog(["T4_BAG"]));
  mocks.routes.mockResolvedValue([]);
  mocks.snapshot.mockResolvedValue({});
  mocks.restore.mockResolvedValue(null);
  mocks.history.mockResolvedValue([]);
  mocks.cachePrices.mockResolvedValue(undefined);
  mocks.loadPrices.mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
});
afterEach(() => vi.unstubAllGlobals());

describe("rolling scan API", () => {
  it("includes coverage only on successful streaming completion", async () => {
    const { GET } = await import("./route");
    const response = await GET(request("rollingCursor=&stream=true&quality=6"));
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      data: { rollingCoverage: { itemIds: ["T4_BAG"], nextCursor: null, totalItems: 1, completedItems: 1 } },
    });
    expect(events.filter((event) => event.type === "error")).toEqual([]);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("still uses last-known cached prices during rolling scans", async () => {
    mocks.loadPrices.mockResolvedValue([{
      itemId: "T4_BAG", city: "Bridgewatch", quality: 1,
      sellPriceMin: 100n, sellPriceMinDate: new Date(), sellPriceMinQuantity: null, sellPriceMinIsFallback: true,
      buyPriceMax: null, buyPriceMaxDate: null, buyPriceMaxQuantity: null, fetchedAt: new Date(),
    }]);
    const { GET } = await import("./route");
    const response = await GET(request("rollingCursor="));
    expect(await response.json()).toMatchObject({ fallbackPriceRows: 1, freshPriceRows: 0, estimatedPriceRows: 0 });
    expect(mocks.cachePrices).toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it.each([
    { ids: [] as string[], query: "rollingCursor=", totalItems: 0 },
    { ids: ["T4_BAG"], query: "rollingCursor=T4_BAG", totalItems: 1 },
    { ids: ["T4_BAG"], query: "rollingCursor=ZZZ", totalItems: 1 },
    { ids: ["T4_BAG"], query: "rollingCursor=&category=Resources", totalItems: 0 },
  ])("does not fetch prices for empty/end selection $query", async ({ ids, query, totalItems }) => {
    mocks.items.mockResolvedValue(catalog(ids));
    const { GET } = await import("./route");
    const { fetchCurrentPricesBatched } = await import("@/lib/albion/current-prices");
    const response = await GET(request(`${query}&quality=6`));
    expect(await response.json()).toMatchObject({
      scannedItems: 0, opportunities: [],
      rollingCoverage: { itemIds: [], totalItems, completedItems: totalItems, nextCursor: null },
    });
    expect(fetchCurrentPricesBatched).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.items).toHaveBeenCalledTimes(1);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("resumes after a missing cursor using only the remaining sorted IDs", async () => {
    mocks.items.mockResolvedValue(catalog(["T4_BAG_C", "T4_BAG_A", "T4_BAG_E"]));
    const { POST } = await import("./route");
    const { fetchCurrentPricesBatched } = await import("@/lib/albion/current-prices");
    const response = await POST(request("", { method: "POST", body: JSON.stringify({ rollingCursor: "T4_BAG_B" }) }));
    expect(await response.json()).toMatchObject({
      scannedItems: 2,
      rollingCoverage: { itemIds: ["T4_BAG_C", "T4_BAG_E"], totalItems: 3, completedItems: 3, nextCursor: null },
    });
    expect(vi.mocked(fetchCurrentPricesBatched).mock.calls[0][0].itemIds).toEqual(["T4_BAG_C", "T4_BAG_E"]);
  });

  it("emits an error without advancing coverage when a later quality fails upstream", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      new URL(url).searchParams.get("qualities") === "3"
        ? new Response("Unavailable", { status: 503 })
        : Response.json([]),
    ));
    const { GET } = await import("./route");
    const response = await GET(request("rollingCursor=&quality=6&stream=true"));
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.filter((event) => event.type === "complete")).toEqual([]);
    expect(events.at(-1)).toEqual({ type: "error", message: "Albion Online Data request failed with status 503." });
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(state.blackMarketCompletedScans?.size ?? 0).toBe(0);
  });

  it("keeps manual full scans and targeted quality-6 scans unchanged", async () => {
    mocks.loadPrices.mockResolvedValue([{
      itemId: "T4_BAG", city: "Bridgewatch", quality: 1,
      sellPriceMin: 100n, sellPriceMinDate: new Date(), sellPriceMinQuantity: null, sellPriceMinIsFallback: true,
      buyPriceMax: null, buyPriceMaxDate: null, buyPriceMaxQuantity: null, fetchedAt: new Date(),
    }]);
    const { GET } = await import("./route");
    const { fetchCurrentPricesBatched } = await import("@/lib/albion/current-prices");
    const full = await GET(request(""));
    expect(await full.json()).not.toHaveProperty("rollingCoverage");
    expect(mocks.snapshot).toHaveBeenCalled();
    expect(mocks.history).toHaveBeenCalled();
    mocks.items.mockClear();
    vi.mocked(fetchCurrentPricesBatched).mockClear();
    const targeted = await GET(request("itemIds=T4_BAG&quality=6"));
    expect(await targeted.json()).toMatchObject({ scannedItems: 5 });
    expect(mocks.items.mock.calls.every(([input]) => input.where.id.in.join(",") === "T4_BAG")).toBe(true);
    expect(vi.mocked(fetchCurrentPricesBatched).mock.calls.map(([input]) => input.qualities)).toEqual([[1], [2], [3], [4], [5]]);
    for (const [input, options] of vi.mocked(fetchCurrentPricesBatched).mock.calls) {
      expect(input.itemIds).toEqual(["T4_BAG"]);
      expect(options).toMatchObject({ allowPartial: true, allowAllBatchesToFail: true });
    }
  });
  it("does not start a streaming scan for an already aborted request", async () => {
    mocks.items.mockResolvedValue([]);
    const controller = new AbortController();
    controller.abort();
    const { GET } = await import("./route");
    const response = await GET(request("rollingCursor=&stream=true", { signal: controller.signal }));
    expect(await response.text()).toBe("");
    expect(mocks.items).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("does not complete when cancelled while the last batch cache is loading", async () => {
    const controller = new AbortController();
    mocks.loadPrices.mockImplementationOnce(async () => {
      controller.abort();
      return [];
    });
    const { GET } = await import("./route");
    await expect(GET(request("rollingCursor=", { signal: controller.signal }))).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("completes a successful batch without usable prices instead of retrying it forever", async () => {
    const { GET } = await import("./route");
    const response = await GET(request("rollingCursor=&quality=6"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      opportunities: [], scannedItems: 5, freshPriceRows: 0, estimatedPriceRows: 0,
      rollingCoverage: { itemIds: ["T4_BAG"], totalItems: 1, completedItems: 1, nextCursor: null },
    });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("scans just 50 distinct category-filtered IDs across qualities 1 through 5", async () => {
    const ids = Array.from({ length: 123 }, (_, index) => `T4_BAG_${String(index).padStart(3, "0")}`);
    mocks.items.mockResolvedValue(catalog(["T4_ORE", ...ids.slice().reverse(), ids[0]]));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const quality = Number(new URL(url).searchParams.get("qualities"));
      return Response.json([{
        item_id: ids[0], city: "Bridgewatch", quality,
        sell_price_min: 100, sell_price_max: 100, buy_price_min: 0, buy_price_max: 0,
        sell_price_min_date: "2026-01-01T00:00:00Z", sell_price_max_date: null,
        buy_price_min_date: null, buy_price_max_date: null,
      }]);
    }));
    const { GET } = await import("./route");
    const { fetchCurrentPricesBatched } = await import("@/lib/albion/current-prices");
    const response = await GET(request("rollingCursor=&category=Equipment&quality=6&allSources=false"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.rollingCoverage).toEqual({ itemIds: ids.slice(0, 50), totalItems: 123, completedItems: 50, nextCursor: ids[49] });
    expect(result.scannedItems).toBe(250);
    expect(vi.mocked(fetchCurrentPricesBatched).mock.calls.map(([input]) => input.qualities)).toEqual([[1], [2], [3], [4], [5]]);
    for (const [input, options] of vi.mocked(fetchCurrentPricesBatched).mock.calls) {
      expect(input.itemIds).toEqual(ids.slice(0, 50));
      expect(options).toMatchObject({ allowPartial: false, allowAllBatchesToFail: false });
    }
    expect(mocks.items).toHaveBeenCalledTimes(1);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(state.blackMarketCompletedScans?.size ?? 0).toBe(0);
    expect(mocks.cachePrices).toHaveBeenCalledTimes(5);
    expect(mocks.history.mock.calls.length).toBe(0);
  });
  it("accepts an empty rolling cursor as the first batch", async () => {
    mocks.items.mockResolvedValue([]);
    const { GET } = await import("./route");
    expect((await GET(request("rollingCursor="))).status).toBe(200);
  });
  it.each(["latest=true", "itemIds=T4_BAG", "itemIds="])("rejects conflicting %s before accessing data", async (conflict) => {
    const { GET, POST } = await import("./route");
    expect((await GET(request(`rollingCursor=&${conflict}`))).status).toBe(400);
    const body = Object.fromEntries(new URLSearchParams(`rollingCursor=&${conflict}`));
    expect((await POST(request("", { method: "POST", body: JSON.stringify(body) }))).status).toBe(400);
    expect(mocks.items).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});
