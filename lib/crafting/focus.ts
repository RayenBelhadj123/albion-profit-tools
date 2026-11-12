export function adjustedFocusCost(
  baseFocusCostPerRun: number | null,
  runs: number,
  focusCostEfficiency: number,
): number | null {
  if (baseFocusCostPerRun === null || baseFocusCostPerRun <= 0) return null;
  if (!Number.isInteger(runs) || runs <= 0) return null;
  const efficiency = Math.max(0, focusCostEfficiency);
  return Math.ceil(baseFocusCostPerRun * runs * 0.5 ** (efficiency / 10_000));
}

export function standardCraftingFocusEfficiency(input: {
  masteryLevel: number;
  itemSpecializationLevel: number;
  siblingSpecializationLevels: number;
}) {
  return clampLevel(input.masteryLevel) * 30 +
    clampLevel(input.itemSpecializationLevel) * 280 +
    Math.max(0, Math.round(input.siblingSpecializationLevels)) * 30;
}

export function refiningFocusEfficiency(
  tier: number,
  specializationByTier: Readonly<Record<number, number>>,
) {
  const allSpecs = [4, 5, 6, 7, 8].reduce(
    (total, currentTier) => total + clampLevel(specializationByTier[currentTier] ?? 0),
    0,
  );
  return allSpecs * 30 + clampLevel(specializationByTier[tier] ?? 0) * 250;
}

function clampLevel(value: number) {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}
