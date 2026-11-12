import { z } from "zod";

export const marketObservationSchema = z.strictObject({
  server: z.enum(["EUROPE", "AMERICAS", "ASIA"]),
  itemId: z.string().trim().toUpperCase().min(1).max(100).regex(/^[A-Z0-9_@]+$/),
  city: z.enum(["BRIDGEWATCH", "BLACK_MARKET", "CAERLEON", "FORT_STERLING", "LYMHURST", "MARTLOCK", "THETFORD"]),
  quality: z.number().int().min(1).max(5),
  orderType: z.enum(["BUY", "SELL"]),
  price: z.bigint().positive().max(1_000_000_000_000n).nullable(),
  availableQuantity: z.number().int().positive().max(1_000_000_000).nullable(),
  observedAt: z.date().nullable(),
  collectedAt: z.date(),
  expiresAt: z.date().nullable(),
  source: z.enum([
    "LIVE_PUBLIC",
    "LAST_KNOWN_PUBLIC",
    "HISTORICAL_PUBLIC",
    "PRIVATE_MANUAL",
    "PRIVATE_IMPORT",
    "PRIVATE_API",
    "CALCULATED",
  ]),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  sourceReference: z.string().trim().max(500).nullable(),
});

export type MarketObservation = z.infer<typeof marketObservationSchema>;

export function normalizeExternalSilver(value: number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  const silver = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  return silver > 0n ? silver : null;
}
