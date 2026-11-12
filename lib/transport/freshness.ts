export function ageInMinutes(observedAt: Date | null, now: Date): number | null {
  if (!observedAt) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - observedAt.getTime()) / 60_000));
}

export function isFresh(
  observedAt: Date | null,
  now: Date,
  maxDataAgeMinutes: number,
): boolean {
  const age = ageInMinutes(observedAt, now);

  return age !== null && age <= maxDataAgeMinutes;
}
