import type { PrismaClient } from "@/app/generated/prisma/client";
import type { AlbionServer } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";

import { toPrismaCity } from "./city-mapping";
import type { HistoricalSellEstimate } from "./historical-prices";

export async function cacheHistoricalPriceEstimates(
  estimates: readonly HistoricalSellEstimate[],
  server: AlbionServer,
  db: PrismaClient = prisma,
) {
  const rows = estimates.flatMap((estimate) => {
    const city = toPrismaCity(estimate.city);
    if (!city) return [];
    return [{
      userId: null,
      server,
      itemId: estimate.itemId,
      city,
      quality: estimate.quality,
      orderType: estimate.strategy === "DESTINATION_REVENUE" ? "BUY" as const : "SELL" as const,
      price: estimate.price,
      availableQuantity: null,
      observedAt: estimate.observedAt,
      collectedAt: new Date(),
      source: "HISTORICAL_PUBLIC" as const,
      confidence: "LOW" as const,
      sourceReference: `albion-online-data/history/${estimate.strategy}/${estimate.days}d`,
      metadataJson: {
        sampleCount: estimate.sampleCount,
        days: estimate.days,
        strategy: estimate.strategy,
        volumeWeighted: true,
      },
    }];
  });

  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500);
    const existing = await db.marketPriceObservation.findMany({
      where: {
        server,
        source: "HISTORICAL_PUBLIC",
        itemId: { in: [...new Set(batch.map((row) => row.itemId))] },
        city: { in: [...new Set(batch.map((row) => row.city))] },
        quality: { in: [...new Set(batch.map((row) => row.quality))] },
        observedAt: { in: batch.map((row) => row.observedAt) },
      },
      select: { itemId: true, city: true, quality: true, orderType: true, price: true, observedAt: true, sourceReference: true },
    });
    const existingKeys = new Set(existing.map(historicalKey));
    const newRows = batch.filter((row) => !existingKeys.has(historicalKey(row)));
    if (newRows.length > 0) await db.marketPriceObservation.createMany({ data: newRows });
  }
}

function historicalKey(row: {
  itemId: string;
  city: string;
  quality: number;
  orderType: string;
  price: bigint | null;
  observedAt: Date | null;
  sourceReference: string | null;
}) {
  return `${row.itemId}\u0000${row.city}\u0000${row.quality}\u0000${row.orderType}\u0000${row.price}\u0000${row.observedAt?.toISOString()}\u0000${row.sourceReference}`;
}
