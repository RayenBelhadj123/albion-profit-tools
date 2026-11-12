import "server-only";

import type { AlbionCity, AlbionServer, MarketOrderType } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import type { MarketPriceCandidate } from "@/lib/transport/types";
import { privateObservationCandidate } from "./candidates";

export async function loadSupplementalPriceSources(input: {
  userId?: string | null;
  server: AlbionServer;
  itemIds: string[];
  cities: AlbionCity[];
  qualities: number[];
  now: Date;
}) {
  const [privateRows, historicalRows] = await Promise.all([
    input.userId ? prisma.privateMarketObservation.findMany({
      where: {
        userId: input.userId, server: input.server, itemId: { in: input.itemIds },
        city: { in: input.cities }, quality: { in: input.qualities },
        OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
      },
      orderBy: { observedAt: "desc" },
    }) : [],
    prisma.marketPriceObservation.findMany({
      where: {
        userId: null, server: input.server, itemId: { in: input.itemIds },
        city: { in: input.cities }, quality: { in: input.qualities },
        source: "HISTORICAL_PUBLIC", price: { not: null }, observedAt: { not: null },
      },
      orderBy: { observedAt: "desc" },
      distinct: ["itemId", "city", "quality", "orderType"],
    }),
  ]);
  const privateByKey = new Map<string, MarketPriceCandidate[]>();
  for (const row of privateRows) {
    const key = sourceKey(row.itemId, row.city, row.quality, row.orderType);
    privateByKey.set(key, [...(privateByKey.get(key) ?? []), privateObservationCandidate(row)]);
  }
  const historicalByKey = new Map<string, MarketPriceCandidate>();
  for (const row of historicalRows) {
    if (row.price === null || row.observedAt === null) continue;
    historicalByKey.set(sourceKey(row.itemId, row.city, row.quality, row.orderType), {
      price: row.price, observedAt: row.observedAt, availableQuantity: row.availableQuantity, source: "CALCULATED",
    });
  }
  return {
    privateCandidates(itemId: string, city: AlbionCity, quality: number, orderType: MarketOrderType) {
      return privateByKey.get(sourceKey(itemId, city, quality, orderType)) ?? [];
    },
    historicalCandidate(itemId: string, city: AlbionCity, quality: number, orderType: MarketOrderType) {
      return historicalByKey.get(sourceKey(itemId, city, quality, orderType)) ?? null;
    },
  };
}

function sourceKey(itemId: string, city: AlbionCity, quality: number, orderType: MarketOrderType) {
  return `${itemId}\u0000${city}\u0000${quality}\u0000${orderType}`;
}
