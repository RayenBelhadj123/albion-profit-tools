import { beforeAll, describe, expect, it } from "vitest";

let historicalFallbackKey: typeof import("./on-demand-history")["historicalFallbackKey"];

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
  ({ historicalFallbackKey } = await import("./on-demand-history"));
});

describe("on-demand historical fallbacks", () => {
  it("keeps item, market and quality estimates separate", () => {
    expect(historicalFallbackKey("T4_BAG", "Black Market", 1)).not.toBe(
      historicalFallbackKey("T4_BAG", "Black Market", 2),
    );
  });
});
