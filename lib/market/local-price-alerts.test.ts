import { describe, expect, it } from "vitest";
import { describePriceFreshness, evaluatePriceAlert, parseLocalAlerts } from "./local-price-alerts";
const now = new Date("2026-11-12T12:00:00Z");
const alert = { id: "test", itemId: "T4_BAG", server: "EUROPE" as const, city: "Bridgewatch" as const, quality: 1, side: "SELL" as const, direction: "BELOW" as const, threshold: "150", maxAgeMinutes: 60 };
const listing = { lowestSell: "120", highestBuy: "100", sellObservedAt: "2026-11-12T11:30:00Z", buyObservedAt: "2026-11-12T11:30:00Z" };
describe("private browser price alerts", () => {
  it("explicitly labels fresh, stale, and unknown observation ages", () => {
    expect(describePriceFreshness("2026-11-12T11:30:00Z", now)).toBe("Fresh · 30 min old at lookup");
    expect(describePriceFreshness("2026-11-12T10:00:00Z", now)).toBe("Stale · 120 min old at lookup");
    expect(describePriceFreshness(null, now)).toBe("Unknown freshness");
    expect(describePriceFreshness("invalid", now)).toBe("Unknown freshness");
    expect(describePriceFreshness("2026-11-13T00:00:00Z", now)).toBe("Unknown freshness");
  });
  it("checks integer silver thresholds only against a fresh selected order side", () => {
    expect(evaluatePriceAlert(alert, listing, now).state).toBe("TRIGGERED");
    expect(evaluatePriceAlert({ ...alert, threshold: "120" }, listing, now).state).toBe("WAITING");
    expect(evaluatePriceAlert({ ...alert, side: "BUY", direction: "ABOVE", threshold: "99" }, listing, now).state).toBe("TRIGGERED");
  });
  it("never triggers for zero, missing, undated, future, or stale observations", () => {
    expect(evaluatePriceAlert(alert, null, now).state).toBe("MISSING");
    expect(evaluatePriceAlert(alert, { ...listing, lowestSell: "0" }, now).state).toBe("MISSING");
    expect(evaluatePriceAlert(alert, { ...listing, sellObservedAt: null }, now).state).toBe("MISSING");
    expect(evaluatePriceAlert(alert, { ...listing, sellObservedAt: "2026-11-13T00:00:00Z" }, now).state).toBe("MISSING");
    expect(evaluatePriceAlert(alert, { ...listing, sellObservedAt: "2026-11-10T00:00:00Z" }, now).state).toBe("STALE");
  });
  it("validates stored browser data instead of trusting arbitrary JSON", () => {
    expect(parseLocalAlerts(JSON.stringify([alert]))).toEqual([alert]);
    expect(parseLocalAlerts("not JSON")).toEqual([]);
    expect(parseLocalAlerts(JSON.stringify([{ ...alert, threshold: "-1" }]))).toEqual([]);
    expect(parseLocalAlerts(JSON.stringify(Array.from({ length: 21 }, () => alert)))).toEqual([]);
  });
});
