# Albion Transport

Albion Transport is a decision-support application for Albion Online traders,
transporters, and crafters.

Its main purpose is to recommend realistic transportation opportunities based
on market prices, capital, carrying capacity, taxes, market-data freshness,
available quantities, crafting costs, resource returns, focus usage, and the
user's private information.

## Main user

An Albion Online player transporting goods between cities.

## Main problem

Existing tools often show theoretical profit without considering:

- available capital
- carrying weight
- stale prices
- realistic quantities
- taxes
- incomplete market information
- mixed-item transport loads
- actual completed-trip results
- crafting profit with and without focus
- resource return rates and crafting fees
- material source cities versus crafted item sell cities

Albion Transport should be closer to a working transport assistant than a
pretty price viewer. The core product promise is:

> Find profitable, realistic routes using public market data, then improve the
> recommendation with private prices, observed quantities, item weights, capital
> limits, and carrying capacity.

The crafting module should follow the same idea:

> Find profitable crafts using public market data, then improve the result with
> private material prices, private sell prices, available quantities, resource
> return rate, focus cost, station fee, and transport requirements.

## Core transport decisions

The first version must answer:

- Which city should I buy from?
- Which city should I transport to?
- Which items are worth carrying on this route?
- How many units can I realistically buy and carry?
- Is the public market data fresh enough to trust?
- Does my private observation override the public data?
- Is profit better by total silver, ROI, profit per kilogram, or quantity?

## Core crafting decisions

The first crafting version must answer:

- Which item should I craft?
- Which city should I buy materials from?
- Which city or hideout should I craft in?
- Which city should I sell the crafted item in?
- Is it profitable without focus?
- Is it profitable with focus?
- How much profit do I get per focus point?
- How much material quantity is available at the expected price?
- How much weight must I transport before and after crafting?
- Did private prices override public market prices?

## Public and private data

Public Albion Online Data prices are useful but incomplete. The app must treat
them as market observations, not guaranteed truth.

Private data belongs only to the current user and can override public data when
it is newer, more trusted, or explicitly selected by the user.

Private data includes:

- manually observed buy and sell prices
- available quantity at an acceptable price
- personal purchase prices
- personal sale prices
- item weights when public metadata is missing or disputed
- route duration estimates
- route risk notes
- transport history

The app must always show whether a value came from public data, private manual
entry, private import, or a calculation.

## MVP ranking fields

Every transport opportunity should expose:

- source city
- destination city
- item id and quality
- purchase price
- expected sale price
- available quantity at acceptable price
- recommended quantity
- item weight
- total transport weight
- investment required
- expected gross revenue
- taxes and fees
- expected net profit
- ROI
- profit per kilogram
- profit per minute when route duration is known
- public/private data source labels
- source and destination data age
- confidence rating
- warnings

The scanner must allow sorting by:

- expected net profit
- ROI
- profit per kilogram
- profit per minute
- available quantity
- required investment
- data freshness
- confidence

## Private override rules

Private observations should be eligible to override public data when:

- the private observation matches item, city, quality, and order type
- the private observation has not expired
- the private observation is newer than the public observation, or the user has
  marked it as preferred

The app must never silently combine public and private prices. Each selected
price needs a source label and timestamp.

## Quantity rules

Quantity is a first-class input. A profitable item is not useful if only one
unit exists at the expected price.

The app should track:

- public order quantity when available
- private observed available quantity
- user-defined maximum acceptable purchase price
- user-defined maximum transport quantity
- recommended quantity after capital and weight limits

Missing quantity must be displayed as unknown, not as zero.

## MVP workflow

1. User selects server.
2. User selects source and destination.
3. User enters capital and carrying capacity.
4. App fetches market information.
5. App rejects unreliable or stale results.
6. App calculates realistic opportunities.
7. App creates an optimized transport load.
8. User can save the plan.
9. User records actual buying and selling results.
10. App compares expected and realized profit.

## Crafting MVP workflow

1. User selects server.
2. User selects craft item and quality.
3. User selects material purchase city.
4. User selects craft city or hideout.
5. User selects sell city.
6. User enters runs, station fee, tax, return rate, and optional focus cost.
7. App fetches material and product prices.
8. App applies private price overrides.
9. App calculates craft cost, return value, sale value, profit, ROI, and profit
   per focus.
10. App shows required material quantities and transport weight.

## Core Differentiator

The app must be useful for real transport decisions, not only market browsing.
Every recommendation should explain:

- whether prices came from Albion Online Data or private user data
- whether private data overrode public data
- how much quantity is available at an acceptable price
- how much silver and weight the opportunity consumes
- profit, ROI, profit per kilogram, and profit per estimated minute
- why an item was accepted or rejected

## Private Data Behavior

Private data belongs only to the authenticated user and must never be mixed
silently with public data.

When both public and private data exist for the same item, city, quality, and
order type, the application should prefer private data when it is newer, still
valid, or explicitly marked as an override.

The UI must show the selected source clearly:

- Public API
- Private manual entry
- Private import
- Calculated estimate

## Required Transport Inputs

The scanner and planner must support:

- server
- origin city
- destination city
- available silver
- maximum carrying weight
- tax percentage
- setup fee
- maximum acceptable data age
- minimum ROI
- minimum profit
- maximum acceptable source buy price
- minimum acceptable destination sell price

## Quantity-Aware Decisions

An item is useful only if enough quantity is available at a price that still
keeps the trip profitable.

The application must track:

- observed source quantity
- observed destination buy-order quantity
- user-entered private quantity
- estimated available quantity when exact quantity is unknown
- recommended quantity after capital and weight limits

Missing quantity is not zero. It should reduce confidence instead of deleting
the opportunity automatically.

## Crafting Differentiator

Crafting should not be just a static recipe calculator. It should connect to
the transport logic:

- buy materials in one city
- craft in another city or hideout
- sell the finished item in the best city
- include resource return rate
- compare focus and no-focus profit
- show profit per focus
- show required material quantity
- show material transport weight and output transport weight
- allow private prices to override public prices
- save completed craft batches and compare expected versus actual profit
