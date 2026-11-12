import { describe, expect, it } from "vitest";
import { LiveCoverageQueue, replaceScannedOpportunities } from "./live-coverage-queue";

describe("LiveCoverageQueue", () => {
  it("retries without advancing work and bounds exponential backoff", () => {
    const queue = new LiveCoverageQueue();
    const pending = queue.next([]);
    for (const delay of [15_000, 30_000, 60_000, 120_000, 120_000]) {
      queue.fail();
      expect(queue.delayMs).toBe(delay);
      expect(queue.next([])).toEqual(pending);
    }
    queue.complete(pending, 70_000, { nextCursor: "T4_BAG", completedItems: 50, totalItems: 200 });
    expect(queue.delayMs).toBe(60_000);
    queue.fail();
    expect(queue.delayMs).toBe(15_000);
  });

  it("wraps only at a successful catalog end and handles an empty catalog", () => {
    const queue = new LiveCoverageQueue();
    queue.complete(queue.next([]), 100, { nextCursor: "T4_BAG", completedItems: 50, totalItems: 51 });
    expect(queue.completedPasses).toBe(0);
    expect(queue.next([])).toEqual({ kind: "ROLLING", cursor: "T4_BAG" });
    queue.complete(queue.next([]), 100, { nextCursor: null, completedItems: 51, totalItems: 51 });
    expect(queue.completedPasses).toBe(1);
    expect(queue.next([])).toEqual({ kind: "ROLLING", cursor: "" });
    queue.complete(queue.next([]), 100, { nextCursor: null, completedItems: 0, totalItems: 0 });
    expect(queue.completedPasses).toBe(2);
    expect(queue.delayMs).toBe(5_000);
  });

  it("requires progress before consuming rolling work", () => {
    const queue = new LiveCoverageQueue();
    const pending = queue.next([]);
    expect(() => queue.complete(pending, 10)).toThrow("without coverage progress");
    expect(queue.next([])).toEqual(pending);
  });
  it("replaces the entire checked item scope, removing routes that no longer qualify", () => {
    const old = [{ itemId: "T4_BAG", profit: 9 }, { itemId: "T4_CAPE", profit: 7 }];
    expect(replaceScannedOpportunities(old, [], ["T4_BAG"])).toEqual([old[1]]);
    expect(replaceScannedOpportunities(old, [{ itemId: "T4_BAG", profit: 3 }], ["T4_BAG"]))
      .toEqual([old[1], { itemId: "T4_BAG", profit: 3 }]);
  });

  it("interleaves bounded priority batches with catalog work without losing pending work", () => {
    const queue = new LiveCoverageQueue();
    const ids = Array.from({ length: 125 }, (_, i) => `T4_ITEM_${i}`);
    const first = queue.next(ids);
    expect(first).toEqual({ kind: "PRIORITY", itemIds: ids.slice(0, 50) });
    // Reading while another scan is busy does not consume the pending batch.
    expect(queue.next(ids)).toEqual(first);
    queue.complete(first, 1_000);
    const rolling = queue.next(ids);
    expect(rolling).toEqual({ kind: "ROLLING", cursor: "" });
    queue.complete(rolling, 1_000, { nextCursor: "T4_ITEM_Z", completedItems: 50, totalItems: 200 });
    const next = queue.next(ids);
    expect(next).toEqual({ kind: "PRIORITY", itemIds: ids.slice(50, 100) });
    queue.complete(next, 1_000);
    expect(queue.next(ids)).toEqual({ kind: "ROLLING", cursor: "T4_ITEM_Z" });
  });
});
