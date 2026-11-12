import { describe, expect, it } from "vitest";

import { isEligibleMarketOpportunity } from "./opportunity-filter";

const filter = {
  minimumRoiBasisPoints: 2_000,
  maximumSourcePriceAgeMinutes: 60,
  maximumDestinationPriceAgeMinutes: 1_440,
};

describe("market opportunity filter", () => {
  it("accepts fresh opportunities with at least 20 percent ROI", () => {
    expect(isEligibleMarketOpportunity({
      isProfitable: true,
      roiBasisPoints: 2_000,
      sourcePriceAgeMinutes: 20,
      destinationPriceAgeMinutes: 1_440,
    }, filter)).toBe(true);
  });

  it("rejects opportunities below 20 percent ROI", () => {
    expect(isEligibleMarketOpportunity({
      isProfitable: true,
      roiBasisPoints: 1_999,
      sourcePriceAgeMinutes: 20,
      destinationPriceAgeMinutes: 20,
    }, filter)).toBe(false);
  });

  it("rejects stale or missing timestamps", () => {
    expect(isEligibleMarketOpportunity({
      isProfitable: true,
      roiBasisPoints: 3_000,
      sourcePriceAgeMinutes: 61,
      destinationPriceAgeMinutes: 20,
    }, filter)).toBe(false);
    expect(isEligibleMarketOpportunity({
      isProfitable: true,
      roiBasisPoints: 3_000,
      sourcePriceAgeMinutes: null,
      destinationPriceAgeMinutes: 20,
    }, filter)).toBe(false);
    expect(isEligibleMarketOpportunity({
      isProfitable: true,
      roiBasisPoints: 3_000,
      sourcePriceAgeMinutes: 20,
      destinationPriceAgeMinutes: 1_441,
    }, filter)).toBe(false);
  });
});
