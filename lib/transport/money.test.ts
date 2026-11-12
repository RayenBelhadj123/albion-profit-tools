import { describe, expect, it } from "vitest";

import { applyBasisPointRate, multiplySilver } from "./money";

describe("money helpers", () => {
  it("applies basis point rates with integer silver math", () => {
    expect(applyBasisPointRate(10_000n, 650)).toBe(650n);
  });

  it("rounds down fractional silver from basis point rates", () => {
    expect(applyBasisPointRate(999n, 650)).toBe(64n);
  });

  it("multiplies silver by quantity using bigint", () => {
    expect(multiplySilver(2_500n, 400)).toBe(1_000_000n);
  });

  it("rejects invalid quantity", () => {
    expect(() => multiplySilver(2_500n, -1)).toThrow(
      "Quantity must be a non-negative integer.",
    );
  });
});
