export function replaceScannedOpportunities<T extends { itemId: string }>(
  current: T[], incoming: T[], scannedItemIds: string[],
): T[] {
  const checked = new Set(scannedItemIds);
  return [...current.filter((row) => !checked.has(row.itemId)), ...incoming];
}

export type CoverageJob =
  | { kind: "PRIORITY"; itemIds: string[] }
  | { kind: "ROLLING"; cursor: string };

export type RollingCoverageProgress = {
  nextCursor: string | null;
  totalItems: number;
  completedItems: number;
};

/** A job is consumed only after success, never when a timer fires. */
export class LiveCoverageQueue {
  private cursor = "";
  private priorityOffset = 0;
  private lastKind: CoverageJob["kind"] = "ROLLING";
  private failures = 0;
  delayMs = 5_000;
  completedItems = 0;
  totalItems = 0;
  completedPasses = 0;

  next(priorityIds: string[]): CoverageJob {
    const ids = [...new Set(priorityIds)];
    if (ids.length && this.lastKind === "ROLLING") {
      const offset = this.priorityOffset % ids.length;
      return { kind: "PRIORITY", itemIds: ids.slice(offset, offset + 50) };
    }
    return { kind: "ROLLING", cursor: this.cursor };
  }

  complete(job: CoverageJob, durationMs: number, coverage?: RollingCoverageProgress) {
    if (job.kind === "ROLLING") {
      if (!coverage) throw new Error("Rolling scan ended without coverage progress.");
      this.cursor = coverage.nextCursor ?? "";
      this.completedItems = coverage.completedItems;
      this.totalItems = coverage.totalItems;
      if (coverage.nextCursor === null) this.completedPasses += 1;
    } else {
      this.priorityOffset += job.itemIds.length;
    }
    this.lastKind = job.kind;
    this.failures = 0;
    // Slow scans get a longer recovery window. No fixed full-scan deadline.
    this.delayMs = Math.min(60_000, Math.max(5_000, durationMs));
  }

  fail() {
    this.failures += 1;
    this.delayMs = Math.min(120_000, 15_000 * 2 ** Math.min(this.failures - 1, 3));
  }
}
