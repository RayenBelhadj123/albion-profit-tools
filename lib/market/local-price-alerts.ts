import { z } from "zod";
import { marketInspectionSchema, type MarketListing } from "@/lib/albion/market-inspector";

export const LOCAL_ALERTS_KEY = "albion-local-price-alerts-v1";
export const localAlertSchema = marketInspectionSchema.omit({ history: true }).extend({
  id: z.string().min(1).max(100),
  side: z.enum(["BUY", "SELL"]),
  direction: z.enum(["ABOVE", "BELOW"]),
  threshold: z.string().regex(/^[1-9][0-9]{0,11}$/),
  maxAgeMinutes: z.number().int().min(1).max(1440).default(60),
});
export type LocalPriceAlert = z.output<typeof localAlertSchema>;
export type PriceAlertResult = { state: "TRIGGERED" | "WAITING" | "STALE" | "MISSING"; price: string | null };

export function describePriceFreshness(observedAt: string | null | undefined, now = new Date()): string {
  const observed = observedAt ? new Date(observedAt).getTime() : NaN;
  if (!Number.isFinite(observed) || observed > now.getTime() + 300_000) return "Unknown freshness";
  const age = Math.max(0, (now.getTime() - observed) / 60_000);
  return `${age > 60 ? "Stale" : "Fresh"} · ${Math.floor(age)} min old at lookup`;
}

export function parseLocalAlerts(raw: string | null): LocalPriceAlert[] {
  try {
    const parsed = z.array(localAlertSchema).max(20).safeParse(JSON.parse(raw ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}

export function evaluatePriceAlert(alert: LocalPriceAlert, listing: MarketListing | null, now = new Date()): PriceAlertResult {
  const value = alert.side === "SELL" ? listing?.lowestSell : listing?.highestBuy;
  const timestamp = alert.side === "SELL" ? listing?.sellObservedAt : listing?.buyObservedAt;
  const observed = timestamp ? new Date(timestamp).getTime() : NaN;
  if (!value || !/^[1-9][0-9]*$/.test(value) || !Number.isFinite(observed) || observed > now.getTime() + 300_000) return { state: "MISSING", price: value ?? null };
  if (now.getTime() - observed > alert.maxAgeMinutes * 60_000) return { state: "STALE", price: value };
  const reached = alert.direction === "BELOW" ? BigInt(value) < BigInt(alert.threshold) : BigInt(value) > BigInt(alert.threshold);
  return { state: reached ? "TRIGGERED" : "WAITING", price: value };
}
