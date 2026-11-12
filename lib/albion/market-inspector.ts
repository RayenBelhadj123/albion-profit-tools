import { z } from "zod";
import { ALBION_CITY_NAMES, getAlbionApiBaseUrl } from "./config";
import { AlbionApiError, fetchCurrentPricesFast } from "./current-prices";
import { albionHistoryPriceResponseSchema } from "./schemas";

export const INSPECTOR_CITIES = [...ALBION_CITY_NAMES, "Black Market"] as const;
export const marketInspectionSchema = z.strictObject({
  itemId: z.string().min(1).max(100).regex(/^[A-Z0-9_@]+$/, "Use an Albion item ID such as T4_BAG."),
  server: z.enum(["EUROPE", "AMERICAS", "ASIA"]).default("EUROPE"),
  city: z.enum(INSPECTOR_CITIES).default("Bridgewatch"),
  quality: z.coerce.number().int().min(1).max(5).default(1),
  history: z.stringbool().default(true),
});
export type MarketSelection = Pick<z.output<typeof marketInspectionSchema>, "itemId" | "server" | "city" | "quality">;
export type HistoryPoint = { timestamp: string; averagePrice: string; itemCount: number };
export type MarketListing = { lowestSell: string | null; highestBuy: string | null; sellObservedAt: string | null; buyObservedAt: string | null };
export type MarketInspection = MarketSelection & {
  fetchedAt: string;
  listing: MarketListing | null;
  currentError: string | null;
  history: HistoryPoint[];
  historyError: string | null;
  historyFromCache: boolean;
  trend: { direction: "UP" | "DOWN" | "STABLE" | "INSUFFICIENT"; changeBasisPoints: number | null; samples: number };
};
type Options = { fetcher?: typeof fetch; now?: () => Date; signal?: AbortSignal };
const historyCaches = new WeakMap<typeof fetch, Map<string, { expiresAt: number; points: HistoryPoint[] }>>();

/** Public item lookup only: deliberately no database, session, or private data imports. */
export async function inspectMarket(rawInput: unknown, options: Options = {}): Promise<MarketInspection> {
  const { history: includeHistory, ...selection } = marketInspectionSchema.parse(rawInput);
  const now = options.now?.() ?? new Date();
  const [current, history] = await Promise.allSettled([
    fetchCurrentPricesFast({ server: selection.server, itemIds: [selection.itemId], locations: [selection.city], qualities: [selection.quality] }, { ...options, allowPartial: true }),
    includeHistory ? loadHistory(selection, now, options) : Promise.resolve({ points: [] as HistoryPoint[], fromCache: false }),
  ]);
  options.signal?.throwIfAborted();
  const price = current.status === "fulfilled"
    ? current.value.find(row => row.itemId === selection.itemId && row.city === selection.city && row.quality === selection.quality)
    : undefined;
  const points = history.status === "fulfilled" ? history.value.points : [];
  const first = points[0];
  const last = points.at(-1);
  const changeBasisPoints = points.length >= 3 ? Math.round(((Number(last!.averagePrice) - Number(first.averagePrice)) / Number(first.averagePrice)) * 10_000) : null;
  return {
    ...selection,
    fetchedAt: now.toISOString(),
    listing: price ? { lowestSell: price.sellPriceMin?.toString() ?? null, highestBuy: price.buyPriceMax?.toString() ?? null, sellObservedAt: price.sellPriceMinDate?.toISOString() ?? null, buyObservedAt: price.buyPriceMaxDate?.toISOString() ?? null } : null,
    currentError: current.status === "rejected" ? publicError(current.reason) : null,
    history: points,
    historyError: history.status === "rejected" ? publicError(history.reason) : null,
    historyFromCache: history.status === "fulfilled" && history.value.fromCache,
    trend: { direction: changeBasisPoints === null ? "INSUFFICIENT" : changeBasisPoints > 200 ? "UP" : changeBasisPoints < -200 ? "DOWN" : "STABLE", changeBasisPoints, samples: points.length },
  };
}

async function loadHistory(selection: MarketSelection, now: Date, options: Options): Promise<{ points: HistoryPoint[]; fromCache: boolean }> {
  options.signal?.throwIfAborted();
  const fetcher = options.fetcher ?? fetch;
  let cache = historyCaches.get(fetcher);
  if (!cache) { cache = new Map(); historyCaches.set(fetcher, cache); }
  const key = JSON.stringify(selection);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now.getTime()) return { points: cached.points, fromCache: true };
  cache.delete(key);
  const start = new Date(now.getTime() - 7 * 86_400_000);
  const url = new URL(`/api/v2/stats/history/${selection.itemId}.json`, getAlbionApiBaseUrl(selection.server));
  url.searchParams.set("locations", selection.city);
  url.searchParams.set("qualities", String(selection.quality));
  url.searchParams.set("time-scale", "24");
  url.searchParams.set("date", start.toISOString().slice(0, 10));
  url.searchParams.set("end_date", now.toISOString().slice(0, 10));
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetcher(url.toString(), {
    cache: "no-store", headers: { accept: "application/json" },
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok) throw new AlbionApiError(`Market history request failed (${response.status}).`, response.status);
  const rows = albionHistoryPriceResponseSchema.parse(await response.json());
  const points = rows.filter(row => row.item_id === selection.itemId && row.location === selection.city && row.quality === selection.quality)
    .flatMap(row => row.data)
    .filter(point => point.avg_price > 0 && Number.isSafeInteger(point.avg_price) && point.item_count > 0 && point.timestamp && point.timestamp >= start && point.timestamp <= now)
    .sort((a, b) => a.timestamp!.getTime() - b.timestamp!.getTime())
    .slice(-7)
    .map(point => ({ timestamp: point.timestamp!.toISOString(), averagePrice: String(point.avg_price), itemCount: point.item_count }));
  options.signal?.throwIfAborted();
  cache.set(key, { points, expiresAt: now.getTime() + 15 * 60_000 });
  while (cache.size > 128) cache.delete(cache.keys().next().value!);
  return { points, fromCache: false };
}

function publicError(error: unknown) {
  if (error instanceof AlbionApiError && error.status === 429) return "Public market API rate limit reached. Wait a minute and try again.";
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return "Public market request timed out. Try again.";
  return "Could not load public market data. Check your connection and retry.";
}
