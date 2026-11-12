import { describe, expect, it } from "vitest";

import { adjustedFocusCost, refiningFocusEfficiency, standardCraftingFocusEfficiency } from "./focus";

describe("focus cost from specialization", () => {
  it("halves focus for each 10,000 efficiency", () => {
    expect(adjustedFocusCost(100, 10, 0)).toBe(1_000);
    expect(adjustedFocusCost(100, 10, 10_000)).toBe(500);
    expect(adjustedFocusCost(100, 10, 20_000)).toBe(250);
  });

  it("calculates standard crafting efficiency", () => {
    expect(standardCraftingFocusEfficiency({ masteryLevel: 100, itemSpecializationLevel: 100, siblingSpecializationLevels: 300 })).toBe(40_000);
  });

  it("calculates refining efficiency for the selected tier", () => {
    expect(refiningFocusEfficiency(6, { 4: 100, 5: 100, 6: 100, 7: 100, 8: 100 })).toBe(40_000);
  });
});
