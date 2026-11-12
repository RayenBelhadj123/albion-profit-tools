import type { AlbionServer } from "@/app/generated/prisma/enums";
import type { MarketPriceCandidate } from "@/lib/transport/types";
import type { AlbionMarketLocation } from "./config";
import { cacheHistoricalPriceEstimates } from "./historical-price-cache";
import { fetchHistoricalSellEstimates, type HistoricalPriceStrategy } from "./historical-prices";

export type HistoricalFallbackRequest = {
  itemIds: string[];
  location: AlbionMarketLocation;
  quality: number;
  strategy: HistoricalPriceStrategy;
};

export async function fetchOnDemandHistoricalFallbacks(input: {
  server: AlbionServer;
  requests: HistoricalFallbackRequest[];
  signal?: AbortSignal;
}) {
  const requests = input.requests.filter((request) => request.itemIds.length > 0);
  if (requests.length === 0) return new Map<string, MarketPriceCandidate>();
  const groups = await Promise.all(requests.map(async (request) => ({
    request,
    estimates: await fetchHistoricalSellEstimates({
      server: input.server,
      itemIds: [...new Set(request.itemIds)],
      locations: [request.location],
      quality: request.quality,
      strategy: request.strategy,
      days: 7,
      signal: input.signal,
    }),
  })));
  const estimates = groups.flatMap((group) => group.estimates);
  await cacheHistoricalPriceEstimates(estimates, input.server);
  return new Map(groups.flatMap(({ request, estimates: groupEstimates }) =>
    groupEstimates.map((estimate) => [historicalFallbackKey(estimate.itemId, request.location, request.quality), {
      price: estimate.price,
      observedAt: estimate.observedAt,
      availableQuantity: null,
      source: "CALCULATED" as const,
    }] as const),
  ));
}

export function historicalFallbackKey(itemId: string, location: string, quality: number) {
  return `${itemId}\u0000${location}\u0000${quality}`;
}
