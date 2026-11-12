import { ageInMinutes, isFresh } from "./freshness";
import type {
  MarketPriceCandidate,
  PriceSelectionInput,
  SelectedMarketPrice,
  TransportWarning,
} from "./types";

export function selectMarketPrice(
  input: PriceSelectionInput,
): SelectedMarketPrice {
  const suppliedPublic = normalizeCandidate(input.publicPrice ?? null);
  const publicPrice = suppliedPublic?.isCachedFallback ? null : suppliedPublic?.source === "CALCULATED" ? null : suppliedPublic;
  const lastKnownPublic = normalizeCandidate(input.lastKnownPublicPrice ?? (suppliedPublic?.isCachedFallback ? suppliedPublic : null));
  const historicalPrice = normalizeCandidate(input.historicalPrice ?? (suppliedPublic?.source === "CALCULATED" ? suppliedPublic : null));
  const calculatedPrice = normalizeCandidate(input.calculatedPrice ?? null);
  const privatePrices = (input.privatePrices ?? [])
    .map(normalizeCandidate)
    .filter(
      (price): price is MarketPriceCandidate =>
        price !== null && !isExpired(price, input.now),
    )
    .sort((left, right) => timestampScore(right) - timestampScore(left));

  const preferredPrivate = privatePrices.find(
    (price) => price.preferredOverride && isUsable(price) && isFresh(price.observedAt, input.now, input.maxDataAgeMinutes),
  );
  const freshestPrivate = privatePrices.find((price) => isUsable(price) && isFresh(price.observedAt, input.now, input.maxDataAgeMinutes)) ?? null;
  const newerManual = privatePrices.find((price) =>
    price.source === "PRIVATE_MANUAL" &&
    isUsable(price) &&
    isFresh(price.observedAt, input.now, input.maxDataAgeMinutes) &&
    isNewerThan(price, publicPrice),
  ) ?? null;
  const stalePrivate = privatePrices.find(isUsable) ?? null;
  const selected =
    preferredPrivate ??
    newerManual ??
    (isUsable(publicPrice) && isFresh(publicPrice.observedAt, input.now, input.maxDataAgeMinutes) ? publicPrice : null) ??
    freshestPrivate ??
    (isUsable(lastKnownPublic) ? lastKnownPublic : null) ??
    (isUsable(historicalPrice) ? historicalPrice : null) ??
    (isUsable(calculatedPrice) ? calculatedPrice : null) ??
    (isUsable(publicPrice) ? publicPrice : null) ??
    stalePrivate ??
    lastKnownPublic ?? historicalPrice ?? calculatedPrice ?? publicPrice;

  if (!selected) {
    return {
      price: null,
      observedAt: null,
      availableQuantity: null,
      source: "PUBLIC",
      warnings: ["Source price missing"],
    };
  }

  const warnings: TransportWarning[] = [];

  if (
    (selected.source === "PRIVATE_MANUAL" || selected.source === "PRIVATE_IMPORT") &&
    publicPrice?.price !== null &&
    publicPrice?.price !== undefined
  ) {
    warnings.push("Private price overrides public price");
  }

  if (selected.isCachedFallback) {
    warnings.push("Last known public price fallback");
  }

  if (selected === historicalPrice) warnings.push("Historical average price estimate");
  if (selected === calculatedPrice) warnings.push("Calculated price estimate");

  if (!isFresh(selected.observedAt, input.now, input.maxDataAgeMinutes)) {
    warnings.push("Source price is stale");
  }

  return {
    ...selected,
    warnings,
  };
}

export function getPriceAgeMinutes(
  price: SelectedMarketPrice,
  now: Date,
): number | null {
  return ageInMinutes(price.observedAt, now);
}

function normalizeCandidate(
  candidate: MarketPriceCandidate | null,
): MarketPriceCandidate | null {
  if (!candidate || candidate.price === null || candidate.price <= 0n) {
    return candidate
      ? {
          ...candidate,
          price: null,
        }
      : null;
  }

  return candidate;
}

function isUsable(candidate: MarketPriceCandidate | null): candidate is MarketPriceCandidate {
  return candidate?.price !== null && candidate?.price !== undefined;
}

function isExpired(candidate: MarketPriceCandidate | null, now: Date): boolean {
  return Boolean(candidate?.expiresAt && candidate.expiresAt.getTime() <= now.getTime());
}

function isNewerThan(candidate: MarketPriceCandidate, comparison: MarketPriceCandidate | null) {
  if (!comparison?.observedAt) return true;
  return Boolean(candidate.observedAt && candidate.observedAt > comparison.observedAt);
}

function timestampScore(candidate: MarketPriceCandidate | null): number {
  return candidate?.observedAt?.getTime() ?? 0;
}
