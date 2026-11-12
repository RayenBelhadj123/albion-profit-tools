import type { PrivateObservationSource } from "@/app/generated/prisma/enums";
import type { PublicMarketPrice } from "@/lib/albion/current-prices";
import type {
  MarketPriceCandidate,
  PriceSource,
} from "@/lib/transport/types";

export type PrivateObservationLike = {
  price: bigint;
  observedAt: Date;
  availableQuantity: number | null;
  expiresAt: Date | null;
  source: PrivateObservationSource;
  preferredOverride: boolean;
};

export function publicSellPriceCandidate(
  price: PublicMarketPrice | null,
): MarketPriceCandidate | null {
  if (!price) {
    return null;
  }

  return {
    price: price.sellPriceMin,
    observedAt: price.sellPriceMinDate,
    availableQuantity: price.sellPriceMinQuantity,
    source: "PUBLIC",
    isCachedFallback: price.sellPriceMinIsFallback,
  };
}

export function publicBuyPriceCandidate(
  price: PublicMarketPrice | null,
): MarketPriceCandidate | null {
  if (!price) {
    return null;
  }

  return {
    price: price.buyPriceMax,
    observedAt: price.buyPriceMaxDate,
    availableQuantity: price.buyPriceMaxQuantity,
    source: "PUBLIC",
    isCachedFallback: price.buyPriceMaxIsFallback,
  };
}

export function privateObservationCandidate(
  observation: PrivateObservationLike,
): MarketPriceCandidate {
  return {
    price: observation.price,
    observedAt: observation.observedAt,
    availableQuantity: observation.availableQuantity,
    expiresAt: observation.expiresAt,
    preferredOverride: observation.preferredOverride,
    source: privateObservationSourceToPriceSource(observation.source),
  };
}

function privateObservationSourceToPriceSource(
  source: PrivateObservationSource,
): PriceSource {
  return source === "MANUAL" ? "PRIVATE_MANUAL" : "PRIVATE_IMPORT";
}
