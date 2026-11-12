import { describe, expect, it } from "vitest";

import { selectRollingCoverage } from "./rolling-coverage";

describe("selectRollingCoverage", () => {
  it.each([
    { cursor: "A", itemIds: ["C", "E"], completedItems: 3 },
    { cursor: "B", itemIds: ["C", "E"], completedItems: 3 },
    { cursor: "0", itemIds: ["A", "C", "E"], completedItems: 3 },
    { cursor: "E", itemIds: [], completedItems: 3 },
    { cursor: "Z", itemIds: [], completedItems: 3 },
  ])("resumes strictly after cursor $cursor even if it no longer exists", ({ cursor, itemIds, completedItems }) => {
    expect(selectRollingCoverage(["E", "A", "C", "C"], cursor)).toEqual({
      itemIds, totalItems: 3, completedItems, nextCursor: null,
    });
  });

  it("returns completed empty coverage for an empty catalog", () => {
    expect(selectRollingCoverage([], "")).toEqual({ itemIds: [], totalItems: 0, completedItems: 0, nextCursor: null });
    expect(selectRollingCoverage([], "REMOVED_ITEM")).toEqual({ itemIds: [], totalItems: 0, completedItems: 0, nextCursor: null });
  });

  it("has no continuation when exactly 50 unique items remain", () => {
    const ids = Array.from({ length: 50 }, (_, index) => `ID_${String(index).padStart(2, "0")}`);
    expect(selectRollingCoverage(ids, "")).toEqual({ itemIds: ids, totalItems: 50, completedItems: 50, nextCursor: null });
  });
  it("covers an entire pass in bounded batches with exact distinct progress", () => {
    const sorted = Array.from({ length: 123 }, (_, index) => `ITEM_${String(index).padStart(3, "0")}`);
    const catalog = [...sorted].reverse().concat(sorted);
    const first = selectRollingCoverage(catalog, "");
    expect(first).toEqual({ itemIds: sorted.slice(0, 50), totalItems: 123, completedItems: 50, nextCursor: "ITEM_049" });
    const second = selectRollingCoverage(catalog, first.nextCursor!);
    expect(second).toEqual({ itemIds: sorted.slice(50, 100), totalItems: 123, completedItems: 100, nextCursor: "ITEM_099" });
    const last = selectRollingCoverage(catalog, second.nextCursor!);
    expect(last).toEqual({ itemIds: sorted.slice(100), totalItems: 123, completedItems: 123, nextCursor: null });
    expect([...first.itemIds, ...second.itemIds, ...last.itemIds]).toEqual(sorted);
  });
  it("sorts unique IDs lexicographically without changing the catalog", () => {
    const catalog = ["T4_Z", "T4_A@1", "T4_A", "T4_Z", "T4_A_2"];
    const original = [...catalog];

    expect(selectRollingCoverage(catalog, "")).toEqual({
      itemIds: ["T4_A", "T4_A@1", "T4_A_2", "T4_Z"],
      totalItems: 4,
      completedItems: 4,
      nextCursor: null,
    });
    expect(catalog).toEqual(original);
  });
});
