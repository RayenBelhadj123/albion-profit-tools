export type RollingCoverage = {
  nextCursor: string | null;
  totalItems: number;
  completedItems: number;
  itemIds: string[];
};

export function selectRollingCoverage(catalogItemIds: readonly string[], cursor: string): RollingCoverage {
  const sortedIds = [...new Set(catalogItemIds)].sort();
  const firstUnprocessed = cursor === "" ? 0 : sortedIds.findIndex((itemId) => itemId > cursor);
  const start = firstUnprocessed === -1 ? sortedIds.length : firstUnprocessed;
  const itemIds = sortedIds.slice(start, start + 50);
  const completedItems = start + itemIds.length;
  return {
    itemIds,
    totalItems: sortedIds.length,
    completedItems,
    nextCursor: completedItems < sortedIds.length ? itemIds[itemIds.length - 1] : null,
  };
}
