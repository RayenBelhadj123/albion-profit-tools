import { describe, expect, it } from "vitest";

import { selectMarketPrice } from "./price-selection";

const now = new Date("2026-08-06T12:00:00Z");

describe("selectMarketPrice", () => {
  it("labels last-known public fallback prices", () => {
    const selected = selectMarketPrice({
      publicPrice: {
        price: 1_500n,
        observedAt: new Date("2026-08-06T11:50:00Z"),
        availableQuantity: null,
        source: "PUBLIC",
        isCachedFallback: true,
      },
      now,
      maxDataAgeMinutes: 60,
    });

    expect(selected.warnings).toContain("Last known public price fallback");
  });

  it("selects fresh public data when no private price exists", () => {
    const selected = selectMarketPrice({
      now,
      maxDataAgeMinutes: 60,
      publicPrice: {
        price: 2_500n,
        observedAt: new Date("2026-08-06T11:50:00Z"),
        availableQuantity: null,
        source: "PUBLIC",
      },
    });

    expect(selected.price).toBe(2_500n);
    expect(selected.source).toBe("PUBLIC");
    expect(selected.warnings).toEqual([]);
  });

  it("uses a newer private price over public data", () => {
    const selected = selectMarketPrice({
      now,
      maxDataAgeMinutes: 60,
      publicPrice: {
        price: 2_500n,
        observedAt: new Date("2026-08-06T11:40:00Z"),
        availableQuantity: null,
        source: "PUBLIC",
      },
      privatePrices: [
        {
          price: 2_300n,
          observedAt: new Date("2026-08-06T11:55:00Z"),
          availableQuantity: 120,
          source: "PRIVATE_MANUAL",
        },
      ],
    });

    expect(selected.price).toBe(2_300n);
    expect(selected.availableQuantity).toBe(120);
    expect(selected.warnings).toContain("Private price overrides public price");
  });

  it("ignores expired private observations", () => {
    const selected = selectMarketPrice({
      now,
      maxDataAgeMinutes: 60,
      publicPrice: {
        price: 2_500n,
        observedAt: new Date("2026-08-06T11:50:00Z"),
        availableQuantity: null,
        source: "PUBLIC",
      },
      privatePrices: [
        {
          price: 2_000n,
          observedAt: new Date("2026-08-06T11:59:00Z"),
          availableQuantity: 120,
          source: "PRIVATE_MANUAL",
          expiresAt: new Date("2026-08-06T11:59:30Z"),
        },
      ],
    });

    expect(selected.price).toBe(2_500n);
    expect(selected.source).toBe("PUBLIC");
  });

  it("marks stale selected data", () => {
    const selected = selectMarketPrice({
      now,
      maxDataAgeMinutes: 30,
      publicPrice: {
        price: 2_500n,
        observedAt: new Date("2026-08-06T10:50:00Z"),
        availableQuantity: null,
        source: "PUBLIC",
      },
    });

    expect(selected.warnings).toContain("Source price is stale");
  });

  it("uses a fresh preferred private override before live public data", () => {
    const selected = selectMarketPrice({
      now, maxDataAgeMinutes: 60,
      publicPrice: { price: 2500n, observedAt: new Date("2026-08-06T11:59:00Z"), availableQuantity: null, source: "PUBLIC" },
      privatePrices: [{ price: 2200n, observedAt: new Date("2026-08-06T11:40:00Z"), availableQuantity: 5, source: "PRIVATE_IMPORT", preferredOverride: true }],
    });
    expect(selected.price).toBe(2200n);
    expect(selected.source).toBe("PRIVATE_IMPORT");
  });

  it("uses fresh live public data before a non-preferred spreadsheet price", () => {
    const selected = selectMarketPrice({
      now, maxDataAgeMinutes: 60,
      publicPrice: { price: 2500n, observedAt: new Date("2026-08-06T11:50:00Z"), availableQuantity: null, source: "PUBLIC" },
      privatePrices: [{ price: 2200n, observedAt: new Date("2026-08-06T11:55:00Z"), availableQuantity: 5, source: "PRIVATE_IMPORT" }],
    });
    expect(selected.price).toBe(2500n);
    expect(selected.source).toBe("PUBLIC");
  });

  it("uses last-known public before historical and historical before calculated", () => {
    const common = { now, maxDataAgeMinutes: 60,
      historicalPrice: { price: 1800n, observedAt: new Date("2026-08-05T12:00:00Z"), availableQuantity: null, source: "CALCULATED" as const },
      calculatedPrice: { price: 1700n, observedAt: now, availableQuantity: null, source: "CALCULATED" as const },
    };
    const withCache = selectMarketPrice({ ...common, lastKnownPublicPrice: { price: 2000n, observedAt: new Date("2026-08-06T10:00:00Z"), availableQuantity: null, source: "PUBLIC", isCachedFallback: true } });
    expect(withCache.price).toBe(2000n);
    expect(withCache.warnings).toContain("Last known public price fallback");
    const withoutCache = selectMarketPrice(common);
    expect(withoutCache.price).toBe(1800n);
    expect(withoutCache.warnings).toContain("Historical average price estimate");
  });
});
