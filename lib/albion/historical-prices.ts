import { getAlbionApiBaseUrl, type AlbionMarketLocation, type AlbionServer } from "./config";
import { AlbionApiError } from "./current-prices";
import { albionHistoryPriceResponseSchema } from "./schemas";

export type HistoricalSellEstimate = {
  itemId: string;
  city: string;
  quality: number;
  price: bigint;
  observedAt: Date;
  sampleCount: number;
  strategy: HistoricalPriceStrategy;
  days: number;
};

export type HistoricalPriceStrategy = "ORIGIN_COST" | "DESTINATION_REVENUE";

export async function fetchHistoricalSellEstimates(request: {
  server: AlbionServer;
  itemIds: string[];
  locations: AlbionMarketLocation[];
  quality: number;
  days?: number;
  strategy?: HistoricalPriceStrategy;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<HistoricalSellEstimate[]> {
  if (request.itemIds.length === 0 || request.locations.length === 0) return [];
  const days = Math.min(14, Math.max(3, request.days ?? 7));
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const url = new URL(
    `/api/v2/stats/history/${request.itemIds.join(",")}.json`,
    getAlbionApiBaseUrl(request.server),
  );
  url.searchParams.set("locations", request.locations.join(","));
  url.searchParams.set("qualities", String(request.quality));
  url.searchParams.set("time-scale", "24");
  url.searchParams.set("date", formatDate(start));
  url.searchParams.set("end_date", formatDate(end));

  const timeoutSignal = AbortSignal.timeout(10_000);
  const signal = request.signal
    ? AbortSignal.any([request.signal, timeoutSignal])
    : timeoutSignal;
  const response = await (request.fetcher ?? fetch)(url, {
    headers: { Accept: "application/json", "Accept-Encoding": "gzip" },
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new AlbionApiError(`Albion Online Data history request failed with status ${response.status}.`, response.status);
  }
  const parsed = albionHistoryPriceResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new AlbionApiError("Albion Online Data returned invalid historical prices.");

  return parsed.data.flatMap((row) => {
    const samples = row.data
      .filter((sample) => sample.avg_price > 0 && sample.item_count > 0 && sample.timestamp)
      .sort((left, right) => left.timestamp!.getTime() - right.timestamp!.getTime())
      .slice(-days);
    if (samples.length === 0) return [];
    const strategy = request.strategy ?? "ORIGIN_COST";
    // Weight the percentile by traded item count so a low-volume outlier day
    // cannot influence the estimate as much as a high-volume trading day.
    const conservativePrice = weightedPriceQuantile(
      samples.map((sample) => ({ price: sample.avg_price, count: sample.item_count })),
      strategy === "DESTINATION_REVENUE" ? 0.25 : 0.6,
    );
    const latest = samples[samples.length - 1];
    return [{
      itemId: row.item_id,
      city: row.location,
      quality: row.quality,
      price: BigInt(conservativePrice),
      observedAt: latest.timestamp!,
      sampleCount: samples.reduce((total, sample) => total + sample.item_count, 0),
      strategy,
      days,
    }];
  });
}

export function weightedPriceQuantile(
  samples: ReadonlyArray<{ price: number; count: number }>,
  quantile: number,
) {
  const usable = samples
    .filter((sample) => sample.price > 0 && sample.count > 0)
    .sort((left, right) => left.price - right.price);
  if (usable.length === 0) throw new AlbionApiError("Historical estimate has no usable samples.");
  const totalCount = usable.reduce((total, sample) => total + sample.count, 0);
  const target = totalCount * Math.min(1, Math.max(0, quantile));
  let cumulative = 0;
  for (const sample of usable) {
    cumulative += sample.count;
    if (cumulative >= target) return sample.price;
  }
  return usable[usable.length - 1].price;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
