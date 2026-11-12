import type { PrismaClient } from "@/app/generated/prisma/client";
import type { AlbionServer } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";

import { toAlbionApiCity, toPrismaCity } from "./city-mapping";
import type { AlbionMarketLocation } from "./config";
import type { PublicMarketPrice } from "./current-prices";

type CachedPriceRequest = {
  server: AlbionServer;
  itemIds: string[];
  locations: AlbionMarketLocation[];
  qualities: number[];
};

export async function cachePublicMarketPrices(
  prices: PublicMarketPrice[],
  server: AlbionServer,
  db: PrismaClient = prisma,
): Promise<void> {
  const cacheable = prices.flatMap((price) => {
    const city = toPrismaCity(price.city);
    if (!city || (price.sellPriceMin === null && price.buyPriceMax === null)) return [];
    return [{ ...price, city }];
  });
  if (cacheable.length === 0) return;

  await db.item.createMany({
    data: Array.from(new Set(cacheable.map((price) => price.itemId))).map((id) => ({ id })),
    skipDuplicates: true,
  });

  // Keep raw statements small for memory-constrained PostgreSQL instances.
  // Each row uses 12 bound parameters and large concurrent coverage scans can
  // otherwise exhaust server memory while PostgreSQL plans the statement.
  const UPSERT_BATCH_SIZE = 50;
  for (let index = 0; index < cacheable.length; index += UPSERT_BATCH_SIZE) {
    const batch = cacheable.slice(index, index + UPSERT_BATCH_SIZE);
    const values = batch.map((_, rowIndex) => {
      const offset = rowIndex * 12;
      return `(
        $${offset + 1}::text, $${offset + 2}::"AlbionServer",
        $${offset + 3}::text, $${offset + 4}::"AlbionCity",
        $${offset + 5}::integer, $${offset + 6}::bigint,
        $${offset + 7}::timestamp(3), $${offset + 8}::integer,
        $${offset + 9}::bigint, $${offset + 10}::timestamp(3),
        $${offset + 11}::integer, $${offset + 12}::timestamp(3)
      )`;
    }).join(",");
    const parameters = batch.flatMap((price) => [
      crypto.randomUUID(),
      server,
      price.itemId,
      price.city,
      price.quality,
      price.sellPriceMin,
      price.sellPriceMinDate,
      price.sellPriceMinQuantity,
      price.buyPriceMax,
      price.buyPriceMaxDate,
      price.buyPriceMaxQuantity,
      price.fetchedAt,
    ]);

    await db.$executeRawUnsafe(
      `INSERT INTO "MarketPriceCache" AS cached
        ("id", "server", "itemId", "city", "quality", "sellPriceMin",
         "sellPriceMinDate", "sellPriceMinQuantity", "buyPriceMax",
         "buyPriceMaxDate", "buyPriceMaxQuantity", "fetchedAt")
       VALUES ${values}
       ON CONFLICT ("server", "itemId", "city", "quality") DO UPDATE SET
         "sellPriceMin" = CASE
           WHEN EXCLUDED."sellPriceMinDate" IS NOT NULL AND
             (cached."sellPriceMinDate" IS NULL OR EXCLUDED."sellPriceMinDate" >= cached."sellPriceMinDate")
           THEN EXCLUDED."sellPriceMin" ELSE cached."sellPriceMin" END,
         "sellPriceMinDate" = CASE
           WHEN EXCLUDED."sellPriceMinDate" IS NOT NULL AND
             (cached."sellPriceMinDate" IS NULL OR EXCLUDED."sellPriceMinDate" >= cached."sellPriceMinDate")
           THEN EXCLUDED."sellPriceMinDate" ELSE cached."sellPriceMinDate" END,
         "sellPriceMinQuantity" = CASE
           WHEN EXCLUDED."sellPriceMinDate" IS NOT NULL AND
             (cached."sellPriceMinDate" IS NULL OR EXCLUDED."sellPriceMinDate" >= cached."sellPriceMinDate")
           THEN EXCLUDED."sellPriceMinQuantity" ELSE cached."sellPriceMinQuantity" END,
         "buyPriceMax" = CASE
           WHEN EXCLUDED."buyPriceMaxDate" IS NOT NULL AND
             (cached."buyPriceMaxDate" IS NULL OR EXCLUDED."buyPriceMaxDate" >= cached."buyPriceMaxDate")
           THEN EXCLUDED."buyPriceMax" ELSE cached."buyPriceMax" END,
         "buyPriceMaxDate" = CASE
           WHEN EXCLUDED."buyPriceMaxDate" IS NOT NULL AND
             (cached."buyPriceMaxDate" IS NULL OR EXCLUDED."buyPriceMaxDate" >= cached."buyPriceMaxDate")
           THEN EXCLUDED."buyPriceMaxDate" ELSE cached."buyPriceMaxDate" END,
         "buyPriceMaxQuantity" = CASE
           WHEN EXCLUDED."buyPriceMaxDate" IS NOT NULL AND
             (cached."buyPriceMaxDate" IS NULL OR EXCLUDED."buyPriceMaxDate" >= cached."buyPriceMaxDate")
           THEN EXCLUDED."buyPriceMaxQuantity" ELSE cached."buyPriceMaxQuantity" END,
         "fetchedAt" = GREATEST(cached."fetchedAt", EXCLUDED."fetchedAt")`,
      ...parameters,
    );
  }

  const observations = toUnifiedPublicObservations(prices, server);
  for (let index = 0; index < observations.length; index += 500) {
    const batch = observations.slice(index, index + 500);
    const existing = await db.marketPriceObservation.findMany({
      where: {
        server,
        source: "LIVE_PUBLIC",
        itemId: { in: [...new Set(batch.map((row) => row.itemId))] },
        city: { in: [...new Set(batch.map((row) => row.city))] },
        quality: { in: [...new Set(batch.map((row) => row.quality))] },
        observedAt: { in: batch.map((row) => row.observedAt) },
      },
      select: { itemId: true, city: true, quality: true, orderType: true, observedAt: true },
    });
    const existingKeys = new Set(existing.map(observationKey));
    await db.marketPriceObservation.createMany({
      data: batch.filter((row) => !existingKeys.has(observationKey(row))),
    });
  }
}

function observationKey(row: {
  itemId: string;
  city: string;
  quality: number;
  orderType: string;
  observedAt: Date | null;
}) {
  return `${row.itemId}\u0000${row.city}\u0000${row.quality}\u0000${row.orderType}\u0000${row.observedAt?.toISOString() ?? "missing"}`;
}

export function toUnifiedPublicObservations(
  prices: readonly PublicMarketPrice[],
  server: AlbionServer,
) {
  return prices.flatMap((row) => {
    const city = toPrismaCity(row.city);
    if (!city) return [];
    const common = {
      server,
      itemId: row.itemId,
      city,
      quality: row.quality,
      collectedAt: row.fetchedAt,
      source: "LIVE_PUBLIC" as const,
      sourceReference: "albion-online-data/current-prices",
    };
    const observations = [];
    if (row.sellPriceMin !== null && row.sellPriceMinDate !== null) {
      observations.push({
        ...common,
        orderType: "SELL" as const,
        price: row.sellPriceMin,
        availableQuantity: row.sellPriceMinQuantity,
        observedAt: row.sellPriceMinDate,
        confidence: publicObservationConfidence(row.sellPriceMinDate, row.fetchedAt),
      });
    }
    if (row.buyPriceMax !== null && row.buyPriceMaxDate !== null) {
      observations.push({
        ...common,
        orderType: "BUY" as const,
        price: row.buyPriceMax,
        availableQuantity: row.buyPriceMaxQuantity,
        observedAt: row.buyPriceMaxDate,
        confidence: publicObservationConfidence(row.buyPriceMaxDate, row.fetchedAt),
      });
    }
    return observations;
  });
}

function publicObservationConfidence(observedAt: Date, collectedAt: Date) {
  const ageMinutes = Math.max(0, collectedAt.getTime() - observedAt.getTime()) / 60_000;
  if (ageMinutes <= 60) return "HIGH" as const;
  if (ageMinutes <= 1_440) return "MEDIUM" as const;
  return "LOW" as const;
}

export async function loadCachedPublicMarketPrices(
  request: CachedPriceRequest,
  db: PrismaClient = prisma,
): Promise<PublicMarketPrice[]> {
  const cities = request.locations.flatMap((location) => {
    const city = toPrismaCity(location);
    return city ? [city] : [];
  });
  if (request.itemIds.length === 0 || cities.length === 0) return [];

  const rows = await db.marketPriceCache.findMany({
      where: {
        server: request.server,
        itemId: { in: request.itemIds },
        city: { in: cities },
        quality: { in: request.qualities },
      },
      select: {
        itemId: true,
        city: true,
        quality: true,
        sellPriceMin: true,
        sellPriceMinDate: true,
        sellPriceMinQuantity: true,
        buyPriceMax: true,
        buyPriceMaxDate: true,
        buyPriceMaxQuantity: true,
        fetchedAt: true,
      },
    });
  const compactKeys = new Map(rows.map((row) => [`${row.itemId}\u0000${row.city}\u0000${row.quality}`, row]));
  const historyItemIds = request.itemIds.filter((itemId) =>
    cities.some((city) => request.qualities.some((quality) => {
      const row = compactKeys.get(`${itemId}\u0000${city}\u0000${quality}`);
      return !row || row.sellPriceMin === null || row.buyPriceMax === null;
    })),
  );
  const observationRows = historyItemIds.length === 0 ? [] : await db.marketPriceObservation.findMany({
      where: {
        userId: null,
        server: request.server,
        itemId: { in: historyItemIds },
        city: { in: cities },
        quality: { in: request.qualities },
        source: { in: ["LIVE_PUBLIC", "LAST_KNOWN_PUBLIC"] },
        price: { not: null },
        observedAt: { not: null },
      },
      select: {
        itemId: true,
        city: true,
        quality: true,
        orderType: true,
        price: true,
        availableQuantity: true,
        observedAt: true,
        collectedAt: true,
      },
      orderBy: { observedAt: "desc" },
      distinct: ["itemId", "city", "quality", "orderType"],
    });

  const compactCache = rows.map((row) => ({
    itemId: row.itemId,
    city: toAlbionApiCity(row.city),
    quality: row.quality,
    sellPriceMin: row.sellPriceMin,
    sellPriceMinDate: row.sellPriceMinDate,
    sellPriceMinQuantity: row.sellPriceMinQuantity,
    sellPriceMinIsFallback: row.sellPriceMin !== null,
    buyPriceMax: row.buyPriceMax,
    buyPriceMaxDate: row.buyPriceMaxDate,
    buyPriceMaxQuantity: row.buyPriceMaxQuantity,
    buyPriceMaxIsFallback: row.buyPriceMax !== null,
    fetchedAt: row.fetchedAt,
  }));
  const historyCache = observationsToLastKnownPrices(observationRows);
  return mergeCurrentAndCachedPrices(compactCache, historyCache);
}

export function observationsToLastKnownPrices(rows: ReadonlyArray<{
  itemId: string;
  city: Parameters<typeof toAlbionApiCity>[0];
  quality: number;
  orderType: "BUY" | "SELL";
  price: bigint | null;
  availableQuantity: number | null;
  observedAt: Date | null;
  collectedAt: Date;
}>): PublicMarketPrice[] {
  const prices = new Map<string, PublicMarketPrice>();
  for (const row of rows) {
    if (row.price === null || row.observedAt === null) continue;
    const city = toAlbionApiCity(row.city);
    const key = `${row.itemId}\u0000${city}\u0000${row.quality}`;
    const existing = prices.get(key) ?? {
      itemId: row.itemId,
      city,
      quality: row.quality,
      sellPriceMin: null,
      sellPriceMinDate: null,
      sellPriceMinQuantity: null,
      sellPriceMinIsFallback: false,
      buyPriceMax: null,
      buyPriceMaxDate: null,
      buyPriceMaxQuantity: null,
      buyPriceMaxIsFallback: false,
      fetchedAt: row.collectedAt,
    };
    if (row.orderType === "SELL" && (!existing.sellPriceMinDate || row.observedAt > existing.sellPriceMinDate)) {
      existing.sellPriceMin = row.price;
      existing.sellPriceMinDate = row.observedAt;
      existing.sellPriceMinQuantity = row.availableQuantity;
      existing.sellPriceMinIsFallback = true;
    }
    if (row.orderType === "BUY" && (!existing.buyPriceMaxDate || row.observedAt > existing.buyPriceMaxDate)) {
      existing.buyPriceMax = row.price;
      existing.buyPriceMaxDate = row.observedAt;
      existing.buyPriceMaxQuantity = row.availableQuantity;
      existing.buyPriceMaxIsFallback = true;
    }
    if (row.collectedAt > existing.fetchedAt) existing.fetchedAt = row.collectedAt;
    prices.set(key, existing);
  }
  return [...prices.values()];
}

export function mergeCurrentAndCachedPrices(
  current: readonly PublicMarketPrice[],
  cached: readonly PublicMarketPrice[],
): PublicMarketPrice[] {
  const merged = new Map(cached.map((price) => [priceKey(price), price]));

  for (const currentPrice of current) {
    const cachedPrice = merged.get(priceKey(currentPrice));
    if (!cachedPrice) {
      merged.set(priceKey(currentPrice), currentPrice);
      continue;
    }
    const sell = newestSide(
      currentPrice.sellPriceMin,
      currentPrice.sellPriceMinDate,
      currentPrice.sellPriceMinIsFallback ?? false,
      cachedPrice.sellPriceMin,
      cachedPrice.sellPriceMinDate,
      cachedPrice.sellPriceMinIsFallback ?? true,
    );
    const buy = newestSide(
      currentPrice.buyPriceMax,
      currentPrice.buyPriceMaxDate,
      currentPrice.buyPriceMaxIsFallback ?? false,
      cachedPrice.buyPriceMax,
      cachedPrice.buyPriceMaxDate,
      cachedPrice.buyPriceMaxIsFallback ?? true,
    );
    merged.set(priceKey(currentPrice), {
      ...currentPrice,
      sellPriceMin: sell.price,
      sellPriceMinDate: sell.observedAt,
      sellPriceMinQuantity: sell.isFallback
        ? cachedPrice.sellPriceMinQuantity
        : currentPrice.sellPriceMinQuantity,
      sellPriceMinIsFallback: sell.isFallback,
      buyPriceMax: buy.price,
      buyPriceMaxDate: buy.observedAt,
      buyPriceMaxQuantity: buy.isFallback
        ? cachedPrice.buyPriceMaxQuantity
        : currentPrice.buyPriceMaxQuantity,
      buyPriceMaxIsFallback: buy.isFallback,
    });
  }

  return Array.from(merged.values());
}

function newestSide(
  currentPrice: bigint | null,
  currentDate: Date | null,
  currentIsFallback: boolean,
  cachedPrice: bigint | null,
  cachedDate: Date | null,
  cachedIsFallback: boolean,
) {
  if (currentPrice === null) {
    return { price: cachedPrice, observedAt: cachedDate, isFallback: cachedIsFallback };
  }
  if (cachedPrice === null || (currentDate?.getTime() ?? -Infinity) >= (cachedDate?.getTime() ?? -Infinity)) {
    return { price: currentPrice, observedAt: currentDate, isFallback: currentIsFallback };
  }
  return { price: cachedPrice, observedAt: cachedDate, isFallback: cachedIsFallback };
}

function priceKey(price: Pick<PublicMarketPrice, "itemId" | "city" | "quality">) {
  return `${price.itemId}\u0000${price.city}\u0000${price.quality}`;
}
