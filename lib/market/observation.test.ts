import { describe, expect, it } from "vitest";

import { marketObservationSchema, normalizeExternalSilver } from "./observation";

describe("unified market observations", () => {
  it("keeps missing prices distinct from zero-valued API placeholders", () => {
    expect(normalizeExternalSilver(undefined)).toBeNull();
    expect(normalizeExternalSilver(0)).toBeNull();
    expect(normalizeExternalSilver(-10)).toBeNull();
    expect(normalizeExternalSilver(1250)).toBe(1250n);
  });

  it("accepts an explicit missing-data observation", () => {
    const result = marketObservationSchema.parse({
      server: "EUROPE",
      itemId: "T4_BAG",
      city: "BLACK_MARKET",
      quality: 1,
      orderType: "BUY",
      price: null,
      availableQuantity: null,
      observedAt: null,
      collectedAt: new Date("2026-08-11T10:00:00Z"),
      expiresAt: null,
      source: "LIVE_PUBLIC",
      confidence: "LOW",
      sourceReference: "albion-online-data",
    });

    expect(result.price).toBeNull();
    expect(result.observedAt).toBeNull();
  });

  it("rejects zero as a real price", () => {
    const result = marketObservationSchema.safeParse({
      server: "EUROPE",
      itemId: "T4_BAG",
      city: "BRIDGEWATCH",
      quality: 1,
      orderType: "SELL",
      price: 0n,
      availableQuantity: null,
      observedAt: new Date(),
      collectedAt: new Date(),
      expiresAt: null,
      source: "LIVE_PUBLIC",
      confidence: "HIGH",
      sourceReference: null,
    });

    expect(result.success).toBe(false);
  });
});
