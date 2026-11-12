import { z } from "zod";
import { createHash } from "node:crypto";

import type { Prisma } from "@/app/generated/prisma/client";
import { toAlbionApiCity, toPrismaCity } from "@/lib/albion/city-mapping";
import { fetchCurrentPricesBatched, type PublicMarketPrice } from "@/lib/albion/current-prices";
import { fetchHistoricalSellEstimates, type HistoricalSellEstimate } from "@/lib/albion/historical-prices";
import { cacheHistoricalPriceEstimates } from "@/lib/albion/historical-price-cache";
import {
  cachePublicMarketPrices,
  loadCachedPublicMarketPrices,
  mergeCurrentAndCachedPrices,
} from "@/lib/albion/market-price-cache";
import type { AlbionServer } from "@/app/generated/prisma/enums";
import { jsonResponse, serializeForJson } from "@/lib/api/json";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getItemCategory, ITEM_CATEGORIES } from "@/lib/items/category";
import { getMarketFeeRates, type MarketSaleMethod } from "@/lib/market/fees";
import { privateObservationCandidate, publicBuyPriceCandidate, publicSellPriceCandidate } from "@/lib/market/candidates";
import { isEligibleMarketOpportunity } from "@/lib/market/opportunity-filter";
import { selectRollingCoverage, type RollingCoverage } from "@/lib/market/rolling-coverage";
import { calculateTransportOpportunity } from "@/lib/transport/opportunity";
import { selectMarketPrice } from "@/lib/transport/price-selection";

export const dynamic = "force-dynamic";

const citySchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim().replaceAll(" ", "_").toUpperCase() : value,
  z.enum(["BRIDGEWATCH", "CAERLEON", "FORT_STERLING", "LYMHURST", "MARTLOCK", "THETFORD"]),
);

const destinationSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim().replaceAll(" ", "_").toUpperCase() : value,
  z.enum(["BLACK_MARKET", "BRIDGEWATCH", "CAERLEON", "FORT_STERLING", "LYMHURST", "MARTLOCK", "THETFORD"]),
);

const royalCities = [
  "BRIDGEWATCH",
  "CAERLEON",
  "FORT_STERLING",
  "LYMHURST",
  "MARTLOCK",
  "THETFORD",
] as const;

type CatalogItem = { id: string; name: string | null; weightGrams: number | null };
const catalogState = globalThis as typeof globalThis & {
  blackMarketCatalog?: { expiresAt: number; items: CatalogItem[] };
};
const CATALOG_CACHE_TTL_MS = 300_000;

const itemIdsSchema = z.string().max(50_000).transform((value, context) => {
  const itemIds = value ? [...new Set(value.split(",").map((itemId) => itemId.trim()).filter(Boolean))] : [];
  if (itemIds.length > 500) {
    context.addIssue({ code: "custom", message: "At most 500 item IDs may be scanned explicitly." });
    return z.NEVER;
  }
  if (itemIds.some((itemId) => itemId.length > 100 || !/^[A-Z0-9_@]+$/i.test(itemId))) {
    context.addIssue({ code: "custom", message: "One or more item IDs are invalid." });
    return z.NEVER;
  }
  return itemIds;
});

const querySchema = z.strictObject({
  server: z.enum(["EUROPE", "AMERICAS", "ASIA"]).default("EUROPE"),
  sourceCity: citySchema.default("BRIDGEWATCH"),
  destinationCity: destinationSchema.default("BLACK_MARKET"),
  allSources: z.stringbool().default(true),
  itemIds: itemIdsSchema.optional(),
  rollingCursor: z.string().max(100).regex(/^[A-Z0-9_@]*$/i).optional(),
  category: z.enum(ITEM_CATEGORIES).optional(),
  sortBy: z.enum(["combined", "marketValue", "roi", "profit", "profitPerKg", "freshness"]).default("combined"),
  // Quality 0 means qualities 1-4; quality 6 is an internal full-coverage mode for 1-5.
  quality: z.coerce.number().int().min(0).max(6).default(1),
  isPremium: z.stringbool().default(true),
  saleMethod: z.enum(["FAST_SELL", "SELL_ORDER"]).default("FAST_SELL"),
  taxRateBasisPoints: z.coerce.number().int().min(0).max(10_000).optional(),
  setupFeeSilver: z.coerce.bigint().min(0n).max(1_000_000_000_000n).default(0n),
  availableSilver: z.coerce.bigint().positive().max(1_000_000_000_000n).default(10_000_000n),
  carryingCapacityGrams: z.coerce.number().int().positive().max(100_000_000).default(1_000_000),
  maximumItemQuantity: z.coerce.number().int().positive().max(1_000_000_000).optional(),
  maxSourceDataAgeMinutes: z.coerce.number().int().min(1).max(10_080).default(60),
  maxDestinationDataAgeMinutes: z.coerce.number().int().min(1).max(10_080).default(1_440),
  minimumRoiBasisPoints: z.coerce.number().int().min(0).max(1_000_000).default(2_000),
  minimumProfitSilver: z.coerce.bigint().min(0n).max(1_000_000_000_000n).default(25_000n),
  showAllPriceMatches: z.stringbool().default(false),
  stream: z.stringbool().default(false),
  latest: z.stringbool().default(false),
  restoreQuality: z.coerce.number().int().min(0).max(5).optional(),
  restoreLimit: z.coerce.number().int().min(1).max(5_000).optional(),
}).superRefine((input, context) => {
  if (input.rollingCursor === undefined) return;
  if (input.latest || input.itemIds !== undefined) {
    context.addIssue({ code: "custom", path: ["rollingCursor"], message: "Rolling coverage cannot be combined with latest or explicit item IDs." });
  }
}).transform((input) => ({ ...input, itemIds: input.itemIds ?? [] }));

type ScanInput = z.infer<typeof querySchema>;
type BlackMarketScanResult = {
  rollingCoverage?: RollingCoverage;
  opportunities: ScoredOpportunity[];
  scannedAt: Date;
  scannedItems: number;
  scannedMarkets: number;
  evaluatedRoutes: number;
  freshPriceRows: number;
  fallbackPriceRows: number;
  estimatedPriceRows: number;
  missingPriceRows: number;
};
const completedScanState = globalThis as typeof globalThis & {
  blackMarketCompletedScans?: Map<string, { cachedAt: Date; result: BlackMarketScanResult }>;
};
const completedScans = completedScanState.blackMarketCompletedScans ?? new Map();
completedScanState.blackMarketCompletedScans = completedScans;
const MAX_COMPLETED_SCANS = 20;

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid market scan.", issues: parsed.error.issues }, { status: 400 });
  }

  return respondToScanRequest(parsed.data, request);
}

export async function POST(request: Request) {
  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return jsonResponse({ error: body.error }, { status: body.status });
  const parsed = querySchema.safeParse(body.value);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid market scan.", issues: parsed.error.issues }, { status: 400 });
  }

  return respondToScanRequest(parsed.data, request);
}

async function respondToScanRequest(input: ScanInput, request: Request) {
  if (input.destinationCity === "BLACK_MARKET" && input.saleMethod === "SELL_ORDER") {
    return jsonResponse({ error: "Black Market supports fast selling to buy orders, not player sell orders." }, { status: 400 });
  }
  if (input.latest) {
    const key = scanCacheKey(input);
    const sliceId = input.restoreQuality === undefined
      ? null
      : scanSnapshotSliceId(key, input.restoreQuality, input.restoreLimit);
    const persistedSlice = sliceId
      ? await prisma.blackMarketScanSnapshot.findUnique({
          where: { id: sliceId },
          select: { result: true, cachedAt: true },
        })
      : null;
    if (persistedSlice) {
      const sliceResult = persistedSlice.result as unknown as BlackMarketScanResult;
      return jsonResponse({
        ...restoredResultView(sliceResult, input),
        cachedAt: persistedSlice.cachedAt.toISOString(),
        restoredFromCache: true,
      });
    }
    const completed = completedScans.get(key);
    if (completed) {
      if (sliceId && input.restoreQuality !== undefined) {
        await persistCompletedScanSlices(key, input.restoreQuality, completed.result, completed.cachedAt);
      }
      return jsonResponse(serializeForJson({ ...restoredResultView(completed.result, input), cachedAt: completed.cachedAt, restoredFromCache: true }));
    }
    const persisted = await prisma.blackMarketScanSnapshot.findUnique({
      where: { id: scanSnapshotId(key) },
      select: { result: true, cachedAt: true },
    });
    if (!persisted && input.itemIds.length === 0) {
      const reconstructed = await reconstructCompletedScanFromLocalCache(input);
      if (reconstructed) {
        return jsonResponse(serializeForJson({
          ...reconstructed,
          cachedAt: new Date(),
          restoredFromCache: true,
          reconstructedFromPriceCache: true,
        }));
      }
    }
    if (!persisted) return jsonResponse({ error: "No completed scan is available for these settings." }, { status: 404 });
    const persistedResult = persisted.result as unknown as BlackMarketScanResult;
    completedScans.set(key, { cachedAt: persisted.cachedAt, result: persistedResult });
    if (sliceId && input.restoreQuality !== undefined) {
      await persistCompletedScanSlices(key, input.restoreQuality, persistedResult, persisted.cachedAt);
    }
    return jsonResponse({
      ...restoredResultView(persistedResult, input),
      cachedAt: persisted.cachedAt.toISOString(),
      restoredFromCache: true,
    });
  }
  if (input.stream) return createStreamingResponse(input, request);

  const result = await runBlackMarketScan(input, { signal: request.signal });
  return jsonResponse(serializeForJson(result));
}

type ScanHooks = {
  signal?: AbortSignal;
  onStarted?: (progress: {
    scannedItems: number;
    scannedMarkets: number;
  }) => void | Promise<void>;
  onProgress?: (progress: {
    phase: "combined";
    completedBatches: number;
    totalBatches: number;
    processedItems: number;
    totalItems: number;
    evaluatedRoutes: number;
    freshPriceRows: number;
    fallbackPriceRows: number;
    estimatedPriceRows: number;
    missingPriceRows: number;
    cachedBatches: number;
    opportunities: ScoredOpportunity[];
  }) => void | Promise<void>;
};

async function runBlackMarketScan(input: ScanInput, hooks: ScanHooks = {}): Promise<BlackMarketScanResult> {
  hooks.signal?.throwIfAborted();
  if (input.rollingCursor === undefined) return runSelectedBlackMarketScan(input, hooks);

  const catalog = (await getCatalogItems([]))
    .filter((item) => !input.category || getItemCategory(item.id) === input.category);
  const rollingCoverage = selectRollingCoverage(catalog.map((item) => item.id), input.rollingCursor);
  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const items = rollingCoverage.itemIds.map((itemId) => itemById.get(itemId)!);
  const result = await runSelectedBlackMarketScan(input, hooks, items);
  hooks.signal?.throwIfAborted();
  return { ...result, rollingCoverage };
}

async function runSelectedBlackMarketScan(input: ScanInput, hooks: ScanHooks, items?: CatalogItem[]): Promise<BlackMarketScanResult> {
  if (input.quality !== 0 && input.quality !== 6) return runBlackMarketScanForQuality(input, hooks, items);

  const qualities = input.quality === 6 ? [1, 2, 3, 4, 5] as const : [1, 2, 3, 4] as const;
  const results: BlackMarketScanResult[] = [];
  for (const [qualityIndex, quality] of qualities.entries()) {
    const previous = summarizeScanResults(results);
    const result = await runBlackMarketScanForQuality(
      { ...input, quality },
      {
        signal: hooks.signal,
        onStarted: qualityIndex === 0
          ? (progress) => hooks.onStarted?.({ scannedItems: progress.scannedItems * qualities.length, scannedMarkets: progress.scannedMarkets })
          : undefined,
        onProgress: (progress) => hooks.onProgress?.({
          ...progress,
          completedBatches: qualityIndex * progress.totalBatches + progress.completedBatches,
          totalBatches: progress.totalBatches * qualities.length,
          processedItems: qualityIndex * progress.totalItems + progress.processedItems,
          totalItems: progress.totalItems * qualities.length,
          evaluatedRoutes: previous.evaluatedRoutes + progress.evaluatedRoutes,
          freshPriceRows: previous.freshPriceRows + progress.freshPriceRows,
          fallbackPriceRows: previous.fallbackPriceRows + progress.fallbackPriceRows,
          estimatedPriceRows: previous.estimatedPriceRows + progress.estimatedPriceRows,
          missingPriceRows: previous.missingPriceRows + progress.missingPriceRows,
          cachedBatches: previous.cachedBatches + progress.cachedBatches,
        }),
      },
      items,
    );
    results.push(result);
  }

  const summary = summarizeScanResults(results);
  const opportunities = results.flatMap((result) => result.opportunities);
  applyCombinedScores(opportunities, input.maxSourceDataAgeMinutes, input.maxDestinationDataAgeMinutes);
  opportunities.sort((left, right) => compareOpportunities(left, right, input.sortBy));
  const result: BlackMarketScanResult = {
    opportunities,
    scannedAt: new Date(),
    scannedItems: results.reduce((total, item) => total + item.scannedItems, 0),
    scannedMarkets: Math.max(0, ...results.map((item) => item.scannedMarkets)),
    evaluatedRoutes: summary.evaluatedRoutes,
    freshPriceRows: summary.freshPriceRows,
    fallbackPriceRows: summary.fallbackPriceRows,
    estimatedPriceRows: summary.estimatedPriceRows,
    missingPriceRows: summary.missingPriceRows,
  };
  await rememberCompletedScan(input, result);
  return result;
}

function summarizeScanResults(results: BlackMarketScanResult[]) {
  return results.reduce((summary, result) => ({
    evaluatedRoutes: summary.evaluatedRoutes + result.evaluatedRoutes,
    freshPriceRows: summary.freshPriceRows + result.freshPriceRows,
    fallbackPriceRows: summary.fallbackPriceRows + result.fallbackPriceRows,
    estimatedPriceRows: summary.estimatedPriceRows + result.estimatedPriceRows,
    missingPriceRows: summary.missingPriceRows + result.missingPriceRows,
    cachedBatches: summary.cachedBatches,
  }), { evaluatedRoutes: 0, freshPriceRows: 0, fallbackPriceRows: 0, estimatedPriceRows: 0, missingPriceRows: 0, cachedBatches: 0 });
}

async function runBlackMarketScanForQuality(input: ScanInput, hooks: ScanHooks = {}, selectedItems?: CatalogItem[]): Promise<BlackMarketScanResult> {
  const currentUser = await getCurrentUser();
  const sourceCities = (input.allSources ? [...royalCities] : [input.sourceCity])
    .filter((city) => city !== input.destinationCity);
  const routeDestinationCity = input.destinationCity === "BLACK_MARKET" ? "CAERLEON" : input.destinationCity;
  const destinationLocation = input.destinationCity === "BLACK_MARKET"
    ? "Black Market"
    : toAlbionApiCity(input.destinationCity);
  const [catalog, routes] = await Promise.all([
    selectedItems ?? getCatalogItems(input.itemIds),
    prisma.route.findMany({
      select: { sourceCity: true, durationMinutes: true },
      where: {
        server: input.server,
        sourceCity: { in: sourceCities },
        destinationCity: routeDestinationCity,
      },
    }),
  ]);
  const items = catalog.filter((item) => !input.category || getItemCategory(item.id) === input.category);
  const itemIds = items.map((item) => item.id);
  const now = new Date();
  await hooks.onStarted?.({ scannedItems: itemIds.length, scannedMarkets: sourceCities.length });

  if (itemIds.length === 0) {
    const result = { opportunities: [], scannedAt: now, scannedItems: 0, scannedMarkets: sourceCities.length, evaluatedRoutes: 0, freshPriceRows: 0, fallbackPriceRows: 0, estimatedPriceRows: 0, missingPriceRows: 0 };
    await rememberCompletedScan(input, result);
    return result;
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const categoryByItem = new Map(items.map((item) => [item.id, getItemCategory(item.id)]));
  const routeBySource = new Map(routes.map((route) => [route.sourceCity, route]));
  const opportunities: ScoredOpportunity[] = [];
  let freshPriceRows = 0;
  let fallbackPriceRows = 0;
  let estimatedPriceRows = 0;
  let missingPriceRows = 0;
  let cachedBatches = 0;
  let processedItems = 0;
  let usablePriceRows = 0;
  const marketLocations = Array.from(new Set([
    destinationLocation,
    ...sourceCities.map(toAlbionApiCity),
  ]));

  await fetchCurrentPricesBatched(
    {
      server: input.server,
      itemIds,
      locations: marketLocations,
      qualities: [input.quality],
    },
    {
      timeoutMs: 30_000,
      allowPartial: input.rollingCursor === undefined,
      maxConcurrency: itemIds.length > 75 ? 2 : 4,
      // Albion Data limits this endpoint to 100 requests per minute. Leave
      // headroom for crafting/refining lookups made by the same application.
      minimumBatchIntervalMs: 700,
      allowAllBatchesToFail: input.rollingCursor === undefined,
      signal: hooks.signal,
      // Small targeted lookups are commonly repeated while comparing an item.
      // Reuse them briefly; full scans still force a new upstream collection.
      cacheTtlMs: itemIds.length <= 75 ? 30_000 : 0,
      onBatch: async (progress) => {
        processedItems += progress.itemIds.length;
        freshPriceRows += progress.prices.filter((price) =>
          hasRequiredMarketPrice(price, destinationLocation, input.saleMethod),
        ).length;
        if (progress.fromCache) cachedBatches += 1;
        const [cachedPriceResult] = await Promise.allSettled([
          loadCachedPublicMarketPrices({
            server: input.server as AlbionServer,
            itemIds: progress.itemIds,
            locations: marketLocations,
            qualities: [input.quality],
          }),
          cachePublicMarketPrices(progress.prices, input.server as AlbionServer),
        ]);
        // Fresh public prices remain usable even if a constrained database
        // cannot persist or load the optional last-known cache for this batch.
        const cachedPrices = cachedPriceResult.status === "fulfilled" ? cachedPriceResult.value : [];
        // A development server can retain an older generated Prisma client in
        // globalThis after the schema changes. Public coverage must continue
        // even when that optional private-observation delegate is unavailable.
        const privateObservationDelegate = prisma.privateMarketObservation;
        const privateObservations = currentUser && privateObservationDelegate ? await privateObservationDelegate.findMany({
          where: {
            userId: currentUser.id,
            server: input.server,
            itemId: { in: progress.itemIds },
            city: { in: marketLocations.map(toPrismaCity).filter((city) => city !== null) },
            quality: input.quality,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: {
            itemId: true, city: true, quality: true, orderType: true, price: true,
            availableQuantity: true, observedAt: true, expiresAt: true, source: true,
            preferredOverride: true,
          },
          orderBy: { observedAt: "desc" },
        }) : [];
        const effectivePrices = mergeCurrentAndCachedPrices(
          progress.prices,
          cachedPrices,
        );
        fallbackPriceRows += effectivePrices.filter((price) =>
          requiredMarketPriceIsFallback(price, destinationLocation, input.saleMethod),
        ).length;
        const usableBatchPriceRows = effectivePrices.filter(
          (price) => hasRequiredMarketPrice(price, destinationLocation, input.saleMethod),
        ).length;
        usablePriceRows += usableBatchPriceRows;
        const missingBatchPriceRows = Math.max(
          0,
          progress.itemIds.length * marketLocations.length - usableBatchPriceRows,
        );
        const destinationByItem = new Map(
          effectivePrices
            .filter((price) => price.city === destinationLocation)
            .map((price) => [price.itemId, price]),
        );
        const itemHasDestinationPrice = (itemId: string) => {
          const candidate = destinationByItem.get(itemId) ?? null;
          const privateDestinationPrices = privateObservations
            .filter((row) => row.itemId === itemId && row.city === input.destinationCity && row.orderType === (input.saleMethod === "FAST_SELL" ? "BUY" : "SELL"))
            .map(privateObservationCandidate);
          return selectMarketPrice({
            publicPrice: destinationPriceCandidate(candidate, input.saleMethod),
            privatePrices: privateDestinationPrices,
            now,
            maxDataAgeMinutes: input.maxDestinationDataAgeMinutes,
          }).price !== null;
        };
        usablePriceRows += new Set(privateObservations.map((row) => `${row.itemId}\u0000${row.city}\u0000${row.orderType}`)).size;
        const missingOriginItemIds = progress.itemIds.filter((itemId) =>
          sourceCities.some((city) => {
            const price = effectivePrices.find((row) =>
              row.itemId === itemId && row.city === toAlbionApiCity(city) && row.quality === input.quality,
            );
            return price?.sellPriceMin === null || price === undefined;
          }),
        );
        const missingDestinationItemIds = progress.itemIds.filter((itemId) => !itemHasDestinationPrice(itemId));
        let historicalOriginEstimates: HistoricalSellEstimate[] = [];
        let historicalDestinationEstimates: HistoricalSellEstimate[] = [];
        if (input.rollingCursor === undefined && (missingOriginItemIds.length > 0 || missingDestinationItemIds.length > 0)) {
          try {
            [historicalOriginEstimates, historicalDestinationEstimates] = await Promise.all([
              fetchHistoricalSellEstimates({
                server: input.server,
                itemIds: missingOriginItemIds,
                locations: sourceCities.map(toAlbionApiCity),
                quality: input.quality,
                days: 7,
                strategy: "ORIGIN_COST",
                signal: hooks.signal,
              }),
              fetchHistoricalSellEstimates({
                server: input.server,
                itemIds: missingDestinationItemIds,
                locations: [destinationLocation],
                quality: input.quality,
                days: 7,
                strategy: "DESTINATION_REVENUE",
                signal: hooks.signal,
              }),
            ]);
            await cacheHistoricalPriceEstimates(
              [...historicalOriginEstimates, ...historicalDestinationEstimates],
              input.server as AlbionServer,
            );
          } catch {
            // Historical data is an optional low-data fallback. Current and
            // last-known observations remain usable when it is unavailable.
          }
        }
        const historicalEstimates = [...historicalOriginEstimates, ...historicalDestinationEstimates];
        estimatedPriceRows += historicalEstimates.length;
        missingPriceRows += Math.max(0, missingBatchPriceRows - historicalEstimates.length);
        const historicalDestinationItemIds = new Set(historicalDestinationEstimates.map((row) => row.itemId));
        const candidateItemIds = progress.itemIds.filter((itemId) =>
          itemHasDestinationPrice(itemId) || historicalDestinationItemIds.has(itemId),
        );
        const batchOpportunities = calculateOpportunities({
          input,
          itemIds: candidateItemIds,
          prices: effectivePrices,
          sourceCities,
          itemById,
          categoryByItem,
          routeBySource,
          destinationLocation,
          now,
          historicalEstimates,
          privateObservations,
        });
        opportunities.push(...batchOpportunities);
        const profitableBatch = batchOpportunities.filter((opportunity) =>
          matchesResultMode(opportunity, input),
        );
        applyCombinedScores(
          profitableBatch,
          input.maxSourceDataAgeMinutes,
          input.maxDestinationDataAgeMinutes,
        );
        profitableBatch.sort((left, right) => compareOpportunities(left, right, input.sortBy));
        await hooks.onProgress?.({
          phase: "combined",
          completedBatches: progress.completedBatches,
          totalBatches: progress.totalBatches,
          processedItems,
          totalItems: itemIds.length,
          evaluatedRoutes: opportunities.length,
          freshPriceRows,
          fallbackPriceRows,
          estimatedPriceRows,
          missingPriceRows,
          cachedBatches,
          opportunities: profitableBatch,
        });
      },
    },
  );

  if (usablePriceRows === 0 && input.rollingCursor === undefined) {
    throw new Error(
      "Albion Online Data returned no usable prices and no last-known prices are cached yet.",
    );
  }

  const profitable = opportunities.filter((opportunity) =>
    matchesResultMode(opportunity, input),
  );
  applyCombinedScores(
    profitable,
    input.maxSourceDataAgeMinutes,
    input.maxDestinationDataAgeMinutes,
  );
  profitable.sort((left, right) => compareOpportunities(left, right, input.sortBy));

  const result = {
    opportunities: profitable,
    scannedAt: now,
    scannedItems: itemIds.length,
    scannedMarkets: sourceCities.length,
    evaluatedRoutes: opportunities.length,
    freshPriceRows,
    fallbackPriceRows,
    estimatedPriceRows,
    missingPriceRows,
  };
  await rememberCompletedScan(input, result);
  return result;
}

function calculateOpportunities(context: {
  input: ScanInput;
  itemIds: string[];
  prices: PublicMarketPrice[];
  sourceCities: (typeof royalCities)[number][];
  itemById: Map<string, { id: string; name: string | null; weightGrams: number | null }>;
  categoryByItem: Map<string, string>;
  routeBySource: Map<string, { durationMinutes: number | null }>;
  destinationLocation: string;
  now: Date;
  historicalEstimates: HistoricalSellEstimate[];
  privateObservations: Array<{
    itemId: string; city: string; quality: number; orderType: "BUY" | "SELL";
    price: bigint; availableQuantity: number | null; observedAt: Date;
    expiresAt: Date | null; source: "MANUAL" | "CSV_IMPORT" | "PRIVATE_API";
    preferredOverride: boolean;
  }>;
}) {
  const { input, itemIds, prices, sourceCities, itemById, categoryByItem, routeBySource, destinationLocation, now, historicalEstimates, privateObservations } = context;
  const feeRates = getMarketFeeRates({ isPremium: input.isPremium, saleMethod: input.saleMethod });
  const priceByMarket = new Map(prices.map((price) => [priceKey(price.itemId, price.city, price.quality), price]));
  return itemIds.flatMap((itemId) => {
    const item = itemById.get(itemId);
    const destination = priceByMarket.get(priceKey(itemId, destinationLocation, input.quality)) ?? null;
    const historicalDestination = historicalEstimates.find((estimate) =>
      estimate.itemId === itemId && estimate.city === destinationLocation && estimate.quality === input.quality,
    );
    return sourceCities.map((sourceCity) => {
      const source = priceByMarket.get(priceKey(itemId, toAlbionApiCity(sourceCity), input.quality)) ?? null;
      const historicalSource = historicalEstimates.find((estimate) =>
        estimate.itemId === itemId && estimate.city === toAlbionApiCity(sourceCity) && estimate.quality === input.quality,
      );
      const route = routeBySource.get(sourceCity);
      const liveSourceCandidate = publicSellPriceCandidate(source);
      const sourcePrivatePrices = privateObservations
        .filter((row) => row.itemId === itemId && row.city === sourceCity && row.quality === input.quality && row.orderType === "SELL")
        .map(privateObservationCandidate);
      const destinationPrivatePrices = privateObservations
        .filter((row) => row.itemId === itemId && row.city === input.destinationCity && row.quality === input.quality && row.orderType === (input.saleMethod === "FAST_SELL" ? "BUY" : "SELL"))
        .map(privateObservationCandidate);
      const historicalCandidate = liveSourceCandidate ? null : selectHistoricalSourcePrice(historicalSource, now, input.maxSourceDataAgeMinutes);
      const selectedSourcePrice = selectMarketPrice({
        publicPrice: liveSourceCandidate,
        historicalPrice: historicalCandidate,
        privatePrices: sourcePrivatePrices,
        now,
        maxDataAgeMinutes: input.maxSourceDataAgeMinutes,
      });
      if (!liveSourceCandidate && historicalCandidate?.price !== null && selectedSourcePrice.source === "CALCULATED") {
        selectedSourcePrice.warnings.push("Historical average price estimate");
      }
      const liveDestinationCandidate = destinationPriceCandidate(destination, input.saleMethod);
      const historicalDestinationCandidate = liveDestinationCandidate
        ? null
        : selectHistoricalSourcePrice(historicalDestination, now, input.maxDestinationDataAgeMinutes);
      const selectedDestinationPrice = selectMarketPrice({
        publicPrice: liveDestinationCandidate,
        historicalPrice: historicalDestinationCandidate,
        privatePrices: destinationPrivatePrices,
        now,
        maxDataAgeMinutes: input.maxDestinationDataAgeMinutes,
      });
      if (!liveDestinationCandidate && historicalDestinationCandidate?.price !== null && selectedDestinationPrice.source === "CALCULATED") {
        selectedDestinationPrice.warnings.push(
          input.saleMethod === "FAST_SELL"
            ? "Destination is a historical trade estimate, not a live buy order"
            : "Historical average price estimate",
        );
      }
      const result = calculateTransportOpportunity({
        itemId,
        quality: input.quality,
        sourceCity,
        destinationCity: input.destinationCity === "BLACK_MARKET" ? "Black Market" : input.destinationCity,
        purchasePrice: selectedSourcePrice,
        expectedSalePrice: selectedDestinationPrice,
        itemWeightGrams: item?.weightGrams ?? null,
        availableCapital: input.availableSilver,
        carryingCapacityGrams: input.carryingCapacityGrams,
        taxRateBasisPoints: input.taxRateBasisPoints ?? feeRates.salesTaxBasisPoints,
        setupFeeSilver: input.setupFeeSilver,
        setupFeeRateBasisPoints: feeRates.setupFeeBasisPoints,
        routeDurationMinutes: route?.durationMinutes ?? null,
        userMaximumQuantity: input.maximumItemQuantity ?? null,
        now,
        maxDataAgeMinutes: input.maxSourceDataAgeMinutes,
        maxSourceDataAgeMinutes: input.maxSourceDataAgeMinutes,
        maxDestinationDataAgeMinutes: input.maxDestinationDataAgeMinutes,
      });
      return {
        ...result,
        warnings: input.saleMethod === "SELL_ORDER"
          ? [...result.warnings, "Profit depends on sell order, not instant sale" as const]
          : result.warnings,
        itemName: item?.name ?? itemId,
        category: categoryByItem.get(itemId) ?? "Other",
        purchasePriceLabel: selectedPriceLabel(selectedSourcePrice, now, input.maxSourceDataAgeMinutes),
        salePriceLabel: selectedPriceLabel(selectedDestinationPrice, now, input.maxDestinationDataAgeMinutes),
        marketValue: result.grossRevenue,
        score: 0,
      };
    });
  });
}

function selectedPriceLabel(price: ReturnType<typeof selectMarketPrice>, now: Date, maxAgeMinutes: number) {
  if (price.price === null) return "Missing";
  if (price.source === "PRIVATE_MANUAL") return "Private manual";
  if (price.source === "PRIVATE_IMPORT") return "Private import";
  if (price.source === "CALCULATED") return "Historical estimate";
  if (price.isCachedFallback) return "Last-known public";
  if (!price.observedAt || now.getTime() - price.observedAt.getTime() > maxAgeMinutes * 60_000) return "Stale public";
  return "Live public";
}

function selectHistoricalSourcePrice(
  estimate: HistoricalSellEstimate | undefined,
  now: Date,
  maxDataAgeMinutes: number,
) {
  const selected = selectMarketPrice({
    publicPrice: estimate ? {
      price: estimate.price,
      observedAt: estimate.observedAt,
      availableQuantity: null,
      source: "CALCULATED",
    } : null,
    now,
    maxDataAgeMinutes,
  });
  return estimate && selected.price !== null
    ? { ...selected, warnings: [...selected.warnings, "Historical average price estimate" as const] }
    : selected;
}

async function getCatalogItems(itemIds: string[]): Promise<CatalogItem[]> {
  if (itemIds.length > 0) {
    return prisma.item.findMany({
      select: { id: true, name: true, weightGrams: true },
      where: {
        id: { in: itemIds },
        NOT: [{ id: { contains: "NONTRADABLE" } }, { id: { startsWith: "QUESTITEM_" } }],
      },
    });
  }

  const now = Date.now();
  if (catalogState.blackMarketCatalog && catalogState.blackMarketCatalog.expiresAt > now) {
    return catalogState.blackMarketCatalog.items;
  }
  const items = await prisma.item.findMany({
    select: { id: true, name: true, weightGrams: true },
    where: { NOT: [{ id: { contains: "NONTRADABLE" } }, { id: { startsWith: "QUESTITEM_" } }] },
  });
  catalogState.blackMarketCatalog = { expiresAt: now + CATALOG_CACHE_TTL_MS, items };
  return items;
}

function scanCacheKey(input: ScanInput) {
  return JSON.stringify({
    server: input.server,
    sourceCity: input.sourceCity,
    destinationCity: input.destinationCity,
    allSources: input.allSources,
    itemIds: [...input.itemIds].sort(),
    category: input.category ?? null,
    sortBy: input.sortBy,
    quality: input.quality,
    isPremium: input.isPremium,
    saleMethod: input.saleMethod,
    taxRateBasisPoints: input.taxRateBasisPoints ?? null,
    setupFeeSilver: input.setupFeeSilver.toString(),
    availableSilver: input.availableSilver.toString(),
    carryingCapacityGrams: input.carryingCapacityGrams,
    maximumItemQuantity: input.maximumItemQuantity ?? null,
    maxSourceDataAgeMinutes: input.maxSourceDataAgeMinutes,
    maxDestinationDataAgeMinutes: input.maxDestinationDataAgeMinutes,
    minimumRoiBasisPoints: input.minimumRoiBasisPoints,
    minimumProfitSilver: input.minimumProfitSilver.toString(),
    showAllPriceMatches: input.showAllPriceMatches,
  });
}

async function rememberCompletedScan(input: ScanInput, result: BlackMarketScanResult) {
  // A bounded rolling batch is never a completed catalog snapshot.
  if (input.rollingCursor !== undefined) return;
  const key = scanCacheKey(input);
  const cachedAt = new Date();
  completedScans.delete(key);
  completedScans.set(key, { cachedAt, result });
  while (completedScans.size > MAX_COMPLETED_SCANS) {
    const oldestKey = completedScans.keys().next().value;
    if (oldestKey === undefined) break;
    completedScans.delete(oldestKey);
  }

  await prisma.blackMarketScanSnapshot.upsert({
    where: { id: scanSnapshotId(key) },
    create: {
      id: scanSnapshotId(key),
      result: serializeForJson(result) as Prisma.InputJsonValue,
      scannedAt: result.scannedAt,
      cachedAt,
    },
    update: {
      result: serializeForJson(result) as Prisma.InputJsonValue,
      scannedAt: result.scannedAt,
      cachedAt,
    },
  });

  if (input.itemIds.length === 0 && (input.quality === 0 || input.quality === 6)) {
    const qualities = input.quality === 6 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4];
    for (const quality of qualities) {
      await persistCompletedScanSlices(key, quality, result, cachedAt);
    }
  }
}

function scanSnapshotId(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function previewRestoreLimit(quality: number) {
  return quality === 0 ? 400 : 200;
}

function expandedRestoreLimit(quality: number) {
  return quality === 0 ? 4_000 : 2_000;
}

function scanSnapshotSliceId(key: string, quality: number, requestedLimit?: number) {
  const tier = (requestedLimit ?? previewRestoreLimit(quality)) > previewRestoreLimit(quality) ? "expanded" : "preview";
  const snapshotKey = tier === "preview"
    ? `${key}\0restore-quality:${quality}`
    : `${key}\0restore-quality:${quality}\0expanded-v2`;
  return createHash("sha256").update(snapshotKey).digest("hex");
}

async function persistCompletedScanSlice(
  key: string,
  quality: number,
  limit: number,
  result: BlackMarketScanResult,
  cachedAt: Date,
) {
  const slice = restoredResultView(result, { restoreQuality: quality, restoreLimit: limit } as ScanInput);
  const id = scanSnapshotSliceId(key, quality, limit);
  await prisma.blackMarketScanSnapshot.upsert({
    where: { id },
    create: {
      id,
      result: serializeForJson(slice) as Prisma.InputJsonValue,
      scannedAt: result.scannedAt,
      cachedAt,
    },
    update: {
      result: serializeForJson(slice) as Prisma.InputJsonValue,
      scannedAt: result.scannedAt,
      cachedAt,
    },
  });
}

async function persistCompletedScanSlices(
  key: string,
  quality: number,
  result: BlackMarketScanResult,
  cachedAt: Date,
) {
  await persistCompletedScanSlice(key, quality, previewRestoreLimit(quality), result, cachedAt);
  await persistCompletedScanSlice(key, quality, expandedRestoreLimit(quality), result, cachedAt);
}

function restoredResultView(result: BlackMarketScanResult, input: ScanInput): BlackMarketScanResult {
  if (input.restoreQuality === undefined && input.restoreLimit === undefined) return result;
  const matchingQuality = input.restoreQuality === undefined
    ? result.opportunities
    : input.restoreQuality === 0
      ? result.opportunities.filter((opportunity) => opportunity.quality >= 1 && opportunity.quality <= 4)
      : result.opportunities.filter((opportunity) => opportunity.quality === input.restoreQuality);
  return {
    ...result,
    opportunities: matchingQuality.slice(0, input.restoreLimit ?? matchingQuality.length),
  };
}

async function reconstructCompletedScanFromLocalCache(input: ScanInput): Promise<BlackMarketScanResult | null> {
  const sourceCities = (input.allSources ? [...royalCities] : [input.sourceCity])
    .filter((city) => city !== input.destinationCity);
  const routeDestinationCity = input.destinationCity === "BLACK_MARKET" ? "CAERLEON" : input.destinationCity;
  const destinationLocation = input.destinationCity === "BLACK_MARKET"
    ? "Black Market"
    : toAlbionApiCity(input.destinationCity);
  const [catalog, routes] = await Promise.all([
    getCatalogItems([]),
    prisma.route.findMany({
      select: { sourceCity: true, durationMinutes: true },
      where: {
        server: input.server,
        sourceCity: { in: sourceCities },
        destinationCity: routeDestinationCity,
      },
    }),
  ]);
  const items = catalog.filter((item) => !input.category || getItemCategory(item.id) === input.category);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const categoryByItem = new Map(items.map((item) => [item.id, getItemCategory(item.id)]));
  const routeBySource = new Map(routes.map((route) => [route.sourceCity, route]));
  const marketLocations = Array.from(new Set([destinationLocation, ...sourceCities.map(toAlbionApiCity)]));
  const qualities = input.quality === 6 ? [1, 2, 3, 4, 5] : input.quality === 0 ? [1, 2, 3, 4] : [input.quality];
  const now = new Date();
  const opportunities: ScoredOpportunity[] = [];
  let fallbackPriceRows = 0;
  let missingPriceRows = 0;
  let newestCachedAt: Date | null = null;

  for (const quality of qualities) {
    for (let index = 0; index < items.length; index += 500) {
      const batchItems = items.slice(index, index + 500);
      const batchIds = batchItems.map((item) => item.id);
      const prices = await loadCachedPublicMarketPrices({
        server: input.server as AlbionServer,
        itemIds: batchIds,
        locations: marketLocations,
        qualities: [quality],
      });
      for (const price of prices) {
        if (!newestCachedAt || price.fetchedAt > newestCachedAt) newestCachedAt = price.fetchedAt;
      }
      fallbackPriceRows += prices.filter((price) =>
        hasRequiredMarketPrice(price, destinationLocation, input.saleMethod),
      ).length;
      missingPriceRows += Math.max(0, batchIds.length * marketLocations.length - prices.length);
      const destinationItemIds = new Set(
        prices
          .filter((price) => price.city === destinationLocation && hasRequiredMarketPrice(price, destinationLocation, input.saleMethod))
          .map((price) => price.itemId),
      );
      opportunities.push(...calculateOpportunities({
        input: { ...input, quality },
        itemIds: batchIds.filter((itemId) => destinationItemIds.has(itemId)),
        prices,
        sourceCities,
        itemById,
        categoryByItem,
        routeBySource,
        destinationLocation,
        now,
        historicalEstimates: [],
        privateObservations: [],
      }));
    }
  }

  if (!newestCachedAt || fallbackPriceRows === 0) return null;
  const matching = opportunities.filter((opportunity) => matchesResultMode(opportunity, input));
  applyCombinedScores(matching, input.maxSourceDataAgeMinutes, input.maxDestinationDataAgeMinutes);
  matching.sort((left, right) => compareOpportunities(left, right, input.sortBy));
  const result: BlackMarketScanResult = {
    opportunities: matching,
    scannedAt: newestCachedAt,
    scannedItems: items.length * qualities.length,
    scannedMarkets: sourceCities.length,
    evaluatedRoutes: opportunities.length,
    freshPriceRows: 0,
    fallbackPriceRows,
    estimatedPriceRows: 0,
    missingPriceRows,
  };
  await rememberCompletedScan(input, result);
  return result;
}

function createStreamingResponse(input: ScanInput, request: Request) {
  const encoder = new TextEncoder();
  const scanController = new AbortController();
  const abortScan = () => scanController.abort();
  let streamCancelled = false;
  request.signal.addEventListener("abort", abortScan, { once: true });
  if (request.signal.aborted) abortScan();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed || streamCancelled || scanController.signal.aborted) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(serializeForJson(event))}\n`));
      };

      void (async () => {
        try {
          const startedAt = Date.now();
          const result = await runBlackMarketScan(input, {
            signal: scanController.signal,
            onStarted: (progress) => send({ type: "started", ...progress }),
            onProgress: (progress) => send({
              type: "progress",
              ...progress,
              elapsedMilliseconds: Date.now() - startedAt,
            }),
          });
          send({ type: "complete", data: result });
        } catch (error) {
          if (!scanController.signal.aborted) {
            send({ type: "error", message: error instanceof Error ? error.message : "Market scan failed." });
          }
        } finally {
          request.signal.removeEventListener("abort", abortScan);
          if (!closed && !streamCancelled) {
            closed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      streamCancelled = true;
      scanController.abort();
      request.signal.removeEventListener("abort", abortScan);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type ScoredOpportunity = ReturnType<typeof calculateTransportOpportunity> & { marketValue: bigint; score: number };

function matchesResultMode(opportunity: ScoredOpportunity, input: ScanInput) {
  if (input.showAllPriceMatches) {
    return opportunity.purchasePrice !== null && opportunity.expectedSalePrice !== null;
  }
  if (opportunity.netProfit < input.minimumProfitSilver) return false;
  return isEligibleMarketOpportunity(opportunity, {
    minimumRoiBasisPoints: input.minimumRoiBasisPoints,
    maximumSourcePriceAgeMinutes: input.maxSourceDataAgeMinutes,
    maximumDestinationPriceAgeMinutes: input.maxDestinationDataAgeMinutes,
  });
}

function applyCombinedScores(
  items: ScoredOpportunity[],
  maxSourceAgeMinutes: number,
  maxDestinationAgeMinutes: number,
) {
  const maxProfit = items.reduce((max, item) => item.netProfit > max ? item.netProfit : max, 0n);
  const maxMarketValue = items.reduce((max, item) => item.marketValue > max ? item.marketValue : max, 0n);
  const maxRoi = Math.max(0, ...items.map((item) => item.roiBasisPoints ?? 0));
  for (const item of items) {
    const sourceFreshness = Math.max(
      0,
      1 - (item.sourcePriceAgeMinutes ?? maxSourceAgeMinutes * 2) / Math.max(1, maxSourceAgeMinutes),
    );
    const destinationFreshness = Math.max(
      0,
      1 - (item.destinationPriceAgeMinutes ?? maxDestinationAgeMinutes * 2) / Math.max(1, maxDestinationAgeMinutes),
    );
    const freshness = sourceFreshness * 0.8 + destinationFreshness * 0.2;
    const profit = maxProfit > 0n ? Number((item.netProfit * 10_000n) / maxProfit) / 10_000 : 0;
    const value = maxMarketValue > 0n ? Number((item.marketValue * 10_000n) / maxMarketValue) / 10_000 : 0;
    const roi = maxRoi > 0 ? (item.roiBasisPoints ?? 0) / maxRoi : 0;
    item.score = Math.round((profit * 0.35 + roi * 0.25 + value * 0.15 + freshness * 0.25) * 10_000) / 100;
  }
}

function compareOpportunities(left: ScoredOpportunity, right: ScoredOpportunity, sortBy: z.infer<typeof querySchema>["sortBy"]) {
  if (sortBy === "profit") return Number(right.netProfit - left.netProfit);
  if (sortBy === "marketValue") return Number(right.marketValue - left.marketValue);
  if (sortBy === "roi") return (right.roiBasisPoints ?? -Infinity) - (left.roiBasisPoints ?? -Infinity);
  if (sortBy === "profitPerKg") return (right.profitPerKgSilver ?? -Infinity) - (left.profitPerKgSilver ?? -Infinity);
  if (sortBy === "freshness") {
    const leftAge = Math.max(left.sourcePriceAgeMinutes ?? Infinity, left.destinationPriceAgeMinutes ?? Infinity);
    const rightAge = Math.max(right.sourcePriceAgeMinutes ?? Infinity, right.destinationPriceAgeMinutes ?? Infinity);
    return leftAge - rightAge;
  }
  return right.score - left.score;
}

function priceKey(itemId: string, city: string, quality: number) {
  return `${itemId}\u0000${city}\u0000${quality}`;
}

function destinationPriceCandidate(price: PublicMarketPrice | null, saleMethod: MarketSaleMethod) {
  return saleMethod === "SELL_ORDER"
    ? publicSellPriceCandidate(price)
    : publicBuyPriceCandidate(price);
}

function hasRequiredMarketPrice(
  price: PublicMarketPrice,
  destinationLocation: string,
  saleMethod: MarketSaleMethod,
) {
  if (price.city !== destinationLocation || saleMethod === "SELL_ORDER") {
    return price.sellPriceMin !== null;
  }
  return price.buyPriceMax !== null;
}

function requiredMarketPriceIsFallback(
  price: PublicMarketPrice,
  destinationLocation: string,
  saleMethod: MarketSaleMethod,
) {
  if (price.city !== destinationLocation || saleMethod === "SELL_ORDER") {
    return price.sellPriceMin !== null && price.sellPriceMinIsFallback === true;
  }
  return price.buyPriceMax !== null && price.buyPriceMaxIsFallback === true;
}
