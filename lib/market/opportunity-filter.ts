export type OpportunityFilterCandidate = {
  isProfitable: boolean;
  roiBasisPoints: number | null;
  sourcePriceAgeMinutes: number | null;
  destinationPriceAgeMinutes: number | null;
};

export type OpportunityFilter = {
  minimumRoiBasisPoints: number;
  maximumSourcePriceAgeMinutes: number;
  maximumDestinationPriceAgeMinutes: number;
};

export function isEligibleMarketOpportunity(
  opportunity: OpportunityFilterCandidate,
  filter: OpportunityFilter,
): boolean {
  return (
    opportunity.isProfitable &&
    opportunity.roiBasisPoints !== null &&
    opportunity.roiBasisPoints >= filter.minimumRoiBasisPoints &&
    opportunity.sourcePriceAgeMinutes !== null &&
    opportunity.sourcePriceAgeMinutes <= filter.maximumSourcePriceAgeMinutes &&
    opportunity.destinationPriceAgeMinutes !== null &&
    opportunity.destinationPriceAgeMinutes <= filter.maximumDestinationPriceAgeMinutes
  );
}
