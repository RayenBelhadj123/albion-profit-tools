import {
  ALBION_API_URL_MAX_LENGTH,
  DEFAULT_ALBION_API_TIMEOUT_MS,
  type AlbionMarketLocation,
  type AlbionServer,
  getDefaultAlbionServer,
  getAlbionApiBaseUrl,
} from "./config";
import {
  albionCurrentPriceResponseSchema,
  type AlbionCurrentPriceApiRow,
} from "./schemas";

export type PublicMarketPrice = {
  itemId: string;
  city: string;
  quality: number;
  sellPriceMin: bigint | null;
  sellPriceMinDate: Date | null;
  sellPriceMinQuantity: number | null;
  sellPriceMinIsFallback?: boolean;
  buyPriceMax: bigint | null;
  buyPriceMaxDate: Date | null;
  buyPriceMaxQuantity: number | null;
  buyPriceMaxIsFallback?: boolean;
  fetchedAt: Date;
};

export type CurrentPriceRequest = {
  server?: AlbionServer;
  itemIds: string[];
  locations: AlbionMarketLocation[];
  qualities?: number[];
};

export type FetchCurrentPricesOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  allowPartial?: boolean;
  maxConcurrency?: number;
  signal?: AbortSignal;
  cacheTtlMs?: number;
  minimumBatchIntervalMs?: number;
  allowAllBatchesToFail?: boolean;
  onBatch?: (progress: CurrentPriceBatchProgress) => void | Promise<void>;
};

export type CurrentPriceBatchProgress = {
  batchIndex: number;
  completedBatches: number;
  totalBatches: number;
  itemIds: string[];
  prices: PublicMarketPrice[];
  fromCache: boolean;
};

type PriceBatchCacheEntry = {
  expiresAt: number;
  prices: PublicMarketPrice[];
};

const defaultPriceBatchCache = new Map<string, PriceBatchCacheEntry>();
const customFetcherCaches = new WeakMap<typeof fetch, Map<string, PriceBatchCacheEntry>>();
const defaultInFlightBatches = new Map<string, Promise<PublicMarketPrice[]>>();
const customFetcherInFlightBatches = new WeakMap<typeof fetch, Map<string, Promise<PublicMarketPrice[]>>>();
const MAX_CACHED_PRICE_BATCHES = 500;

export class AlbionApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AlbionApiError";
  }
}

export function buildCurrentPricesUrl(request: CurrentPriceRequest): string {
  const server = request.server ?? getDefaultAlbionServer();
  const itemIds = normalizeList(request.itemIds, "itemIds");
  const locations = normalizeList(request.locations, "locations");
  const qualities = request.qualities?.length
    ? request.qualities.map(String)
    : ["1"];

  const url = new URL(
    `/api/v2/stats/prices/${itemIds.join(",")}.json`,
    getAlbionApiBaseUrl(server),
  );

  url.searchParams.set("locations", locations.join(","));
  url.searchParams.set("qualities", qualities.join(","));

  const result = url.toString();

  if (result.length > ALBION_API_URL_MAX_LENGTH) {
    throw new AlbionApiError(
      `Albion Online Data URL is too long: ${result.length} characters.`,
    );
  }

  return result;
}

export async function fetchCurrentPrices(
  request: CurrentPriceRequest,
  options: FetchCurrentPricesOptions = {},
): Promise<PublicMarketPrice[]> {
  const fetcher = options.fetcher ?? fetch;
  const configuredTimeoutMs = Number(process.env.ALBION_API_TIMEOUT_MS);
  const timeoutMs =
    options.timeoutMs ??
    (Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
      ? configuredTimeoutMs
      : DEFAULT_ALBION_API_TIMEOUT_MS);
  const fetchedAt = options.now?.() ?? new Date();
  const controller = new AbortController();
  const cancelFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(buildCurrentPricesUrl(request), {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new AlbionApiError(
          "Albion Online Data is rate limiting price requests. Wait for the next minute, then scan again.",
          429,
        );
      }
      throw new AlbionApiError(
        `Albion Online Data request failed with status ${response.status}.`,
        response.status,
      );
    }

    const rawData: unknown = await response.json();
    const parsed = albionCurrentPriceResponseSchema.parse(rawData);

    return parsed.map((row) => normalizeCurrentPrice(row, fetchedAt));
  } catch (error) {
    if (error instanceof AlbionApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      if (options.signal?.aborted) {
        throw new AlbionApiError("Albion Online Data request was cancelled.");
      }
      throw new AlbionApiError(
        `Albion Online Data request timed out after ${timeoutMs}ms.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancelFromCaller);
  }
}

export async function fetchCurrentPricesBatched(
  request: CurrentPriceRequest,
  options: FetchCurrentPricesOptions = {},
): Promise<PublicMarketPrice[]> {
  const itemIds = Array.from(new Set(request.itemIds));
  const batches: string[][] = [];
  let batch: string[] = [];

  for (const itemId of itemIds) {
    const candidate = [...batch, itemId];
    if (candidate.length > 75) {
      batches.push(batch);
      batch = [itemId];
      continue;
    }
    try {
      buildCurrentPricesUrl({ ...request, itemIds: candidate });
      batch = candidate;
    } catch (error) {
      if (!(error instanceof AlbionApiError) || batch.length === 0) throw error;
      batches.push(batch);
      batch = [itemId];
    }
  }
  if (batch.length > 0) batches.push(batch);

  const results: PublicMarketPrice[][] = new Array(batches.length);
  let nextBatch = 0;
  let completedBatches = 0;
  let failedBatches = 0;
  let nextBatchStartAt = Date.now();
  const minimumBatchIntervalMs = Math.max(0, options.minimumBatchIntervalMs ?? 0);
  const requestedConcurrency = options.maxConcurrency ?? 1;
  const maxConcurrency = Number.isInteger(requestedConcurrency)
    ? Math.max(1, Math.min(requestedConcurrency, 8))
    : 1;
  const workers = Array.from(
    { length: Math.min(maxConcurrency, batches.length) },
    async () => {
      while (nextBatch < batches.length) {
        if (options.signal?.aborted) {
          throw new AlbionApiError("Albion Online Data scan was cancelled.");
        }
        const index = nextBatch;
        nextBatch += 1;
        const scheduledStartAt = Math.max(Date.now(), nextBatchStartAt);
        nextBatchStartAt = scheduledStartAt + minimumBatchIntervalMs;
        const delayBeforeFetchMs = scheduledStartAt - Date.now();
        let fromCache = false;
        try {
          const batchResult = await fetchPriceBatchCached(
            request,
            batches[index],
            options,
            delayBeforeFetchMs,
          );
          results[index] = batchResult.prices;
          fromCache = batchResult.fromCache;
        } catch (error) {
          if (options.signal?.aborted) throw error;
          if (error instanceof AlbionApiError && error.status === 429) throw error;
          if (!options.allowPartial) throw error;
          failedBatches += 1;
          results[index] = [];
        }
        completedBatches += 1;
        await options.onBatch?.({
          batchIndex: index,
          completedBatches,
          totalBatches: batches.length,
          itemIds: batches[index],
          prices: results[index],
          fromCache,
        });
      }
    },
  );
  await Promise.all(workers);
  if (
    failedBatches === batches.length &&
    batches.length > 0 &&
    !options.allowAllBatchesToFail
  ) {
    throw new AlbionApiError(
      "Albion Online Data did not return any price batches. Check the selected server or wait briefly, then scan again.",
    );
  }
  return results.flat();
}

/**
 * Low-latency path for calculators and item detail requests. Nearby requests
 * share one upstream call and reuse its result briefly, while the large market
 * scanner can continue to control batching and pacing explicitly.
 */
export function fetchCurrentPricesFast(
  request: CurrentPriceRequest,
  options: FetchCurrentPricesOptions = {},
): Promise<PublicMarketPrice[]> {
  return fetchCurrentPricesBatched(request, {
    ...options,
    cacheTtlMs: options.cacheTtlMs ?? 30_000,
    maxConcurrency: 1,
    minimumBatchIntervalMs: 0,
  });
}

async function fetchPriceBatchCached(
  request: CurrentPriceRequest,
  itemIds: string[],
  options: FetchCurrentPricesOptions,
  delayBeforeFetchMs: number,
) {
  const cacheTtlMs = options.cacheTtlMs ?? 0;
  if (cacheTtlMs <= 0) {
    if (delayBeforeFetchMs > 0) await delay(delayBeforeFetchMs);
    return {
      prices: await fetchPriceBatchWithFallback(request, itemIds, options),
      fromCache: false,
    };
  }

  const cache = getPriceBatchCache(options.fetcher);
  const key = buildCurrentPricesUrl({ ...request, itemIds });
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return { prices: cached.prices, fromCache: true };
  }
  if (cached) cache.delete(key);

  const inFlight = getInFlightBatchMap(options.fetcher);
  let pending = inFlight.get(key);
  const joinedExistingRequest = Boolean(pending);
  if (!pending) {
    pending = (async () => {
      try {
        if (delayBeforeFetchMs > 0) await delay(delayBeforeFetchMs);
        const prices = await fetchPriceBatchWithFallback(request, itemIds, {
          ...options,
          signal: undefined,
          onBatch: undefined,
        });
        const completedAt = Date.now();
        cache.set(key, { expiresAt: completedAt + cacheTtlMs, prices });
        prunePriceBatchCache(cache, completedAt);
        return prices;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }

  const prices = await waitForSharedBatch(pending, options.signal);
  return { prices, fromCache: joinedExistingRequest };
}

function getPriceBatchCache(fetcher?: typeof fetch) {
  if (!fetcher) return defaultPriceBatchCache;
  let cache = customFetcherCaches.get(fetcher);
  if (!cache) {
    cache = new Map();
    customFetcherCaches.set(fetcher, cache);
  }
  return cache;
}

function getInFlightBatchMap(fetcher?: typeof fetch) {
  if (!fetcher) return defaultInFlightBatches;
  let inFlight = customFetcherInFlightBatches.get(fetcher);
  if (!inFlight) {
    inFlight = new Map();
    customFetcherInFlightBatches.set(fetcher, inFlight);
  }
  return inFlight;
}

function waitForSharedBatch(pending: Promise<PublicMarketPrice[]>, signal?: AbortSignal) {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(new AlbionApiError("Albion Online Data scan was cancelled."));
  return new Promise<PublicMarketPrice[]>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new AlbionApiError("Albion Online Data scan was cancelled."));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (prices) => { cleanup(); resolve(prices); },
      (error: unknown) => { cleanup(); reject(error); },
    );
  });
}

function prunePriceBatchCache(cache: Map<string, PriceBatchCacheEntry>, now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > MAX_CACHED_PRICE_BATCHES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

async function fetchPriceBatchWithFallback(
  request: CurrentPriceRequest,
  itemIds: string[],
  options: FetchCurrentPricesOptions,
  attempt = 0,
): Promise<PublicMarketPrice[]> {
  try {
    return await fetchCurrentPrices({ ...request, itemIds }, options);
  } catch (error) {
    if (options.allowPartial) throw error;
    if (error instanceof AlbionApiError && error.status === 429) {
      if (attempt >= 3) throw error;
      await delay(1_000 * 2 ** attempt);
      return fetchPriceBatchWithFallback(request, itemIds, options, attempt + 1);
    }
    if (itemIds.length === 1) throw error;
    const middle = Math.ceil(itemIds.length / 2);
    const [left, right] = await Promise.all([
      fetchPriceBatchWithFallback(request, itemIds.slice(0, middle), options),
      fetchPriceBatchWithFallback(request, itemIds.slice(middle), options),
    ]);
    return [...left, ...right];
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeCurrentPrice(
  row: AlbionCurrentPriceApiRow,
  fetchedAt: Date,
): PublicMarketPrice {
  return {
    itemId: row.item_id,
    city: row.city,
    quality: row.quality,
    sellPriceMin: row.sell_price_min > 0 ? BigInt(row.sell_price_min) : null,
    sellPriceMinDate: row.sell_price_min_date,
    sellPriceMinQuantity: null,
    buyPriceMax: row.buy_price_max > 0 ? BigInt(row.buy_price_max) : null,
    buyPriceMaxDate: row.buy_price_max_date,
    buyPriceMaxQuantity: null,
    fetchedAt,
  };
}

function normalizeList(values: string[], fieldName: string): string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean);

  if (normalized.length === 0) {
    throw new AlbionApiError(`${fieldName} must contain at least one value.`);
  }

  return Array.from(new Set(normalized));
}
