# Implementation Plan

## Product direction

Build Albion Transport as a private-first transport and crafting decision tool.
Public Albion Online Data supplies baseline market prices, while private
observations can override those prices and add missing quantities. The scanner,
planner, and crafting calculator are the main product; visual polish comes after
the calculation engines are trusted.

## Architecture

- Next.js App Router for pages and route handlers.
- TypeScript for application and domain logic.
- Prisma with PostgreSQL for private data and public price cache.
- Zod for environment variables, API input, and external API responses.
- Calculation engine in framework-independent TypeScript modules.
- UI pages consume typed server actions or route handlers, not raw external API
  calls.

## Initial modules

- `app/api/health/route.ts`: health check.
- `lib/env.ts`: environment validation.
- `lib/albion/`: Albion Online Data client, schemas, server config, cache
  helpers.
- `lib/transport/`: price selection, opportunity calculation, mixed-load
  optimizer.
- `lib/crafting/`: recipe costing, resource returns, focus comparison, station
  fees, and profit per focus.
- `lib/db/`: Prisma client and database helpers.
- `lib/items/`: static or imported item metadata including weight.

## Database entities

- `User`
- `Item`
- `MarketPriceCache`
- `PrivateMarketObservation`
- `Route`
- `TransportProfile`
- `TransportPlan`
- `TransportPlanItem`
- `CompletedTrip`
- `CompletedTripItem`
- `CraftRecipe`
- `CraftRecipeIngredient`
- `CraftProfile`
- `CraftPlan`
- `CraftPlanItem`
- `CraftPlanIngredient`
- `CompletedCraftBatch`
- `CompletedCraftBatchItem`
- `UserSetting`

The MVP may use a single local user, but every private table should still have a
`userId` so the app can become multi-user later.

## Frontend pages

- `/`: focused dashboard with recent plans, scanner shortcut, and last trip
  accuracy.
- `/black-market`: compare a selected origin with a royal-city or Black Market destination.
- `/planner`: build a mixed transport load from ranked opportunities.
- `/private-prices`: add and import private observations.
- `/plans`: saved transport plans.
- `/trips`: completed trips and expected versus actual profit.
- `/crafting`: direct crafting calculator with focus and no-focus comparison.
- `/crafting/plans`: saved craft plans.
- `/crafting/history`: completed craft batches and expected versus actual
  profit.
- `/settings`: server, tax, capacity, freshness, and default route settings.

## MVP build order

1. Add root project instructions and complete product docs.
2. Configure environment validation and health check.
3. Expand Prisma schema for users, prices, routes, plans, and trips.
4. Add tests for pure calculation utilities.
5. Implement the price selection rules.
6. Implement single-item opportunity calculations.
7. Implement Albion Online Data client with Zod validation and cache writes.
8. Build the unified `/black-market` route scanner using mocked or cached data.
9. Add private price entry and override behavior.
10. Build the first mixed-load optimizer.
11. Add completed trips and expected versus actual profit.
12. Add crafting recipe schema and direct crafting calculation tests.
13. Build `/crafting` with material/source/sell cities and private overrides.
14. Add refining, food/potions, artifact foundry, and profit-tree views after
    direct crafting is reliable.

## Acceptance rules

- Missing prices and missing quantities are never treated as zero.
- Every recommendation states origin, destination, quantity, data source, data
  age, and warnings.
- Private data can override public data, but the override must be visible.
- Calculations respect capital and carrying capacity.
- Financial calculations use integer silver values.
- Tests cover zero price, missing price, stale data, limited quantity, limited
  capital, limited weight, negative profit, and private override cases.
- Crafting calculations compare focus and no-focus profit.
- Crafting calculations include resource return rate, station fee, taxes, setup
  fee, and profit per focus when focus cost is known.

## Main risks

- Albion Online Data can be stale or missing because it is community-fed.
- Item weight metadata may require a maintained local dataset.
- Public API quantity data may be incomplete, so private observations are
  important for real transport decisions.
- A naive optimizer can look optimal but be unrealistic if it ignores available
  quantity and freshness.
- Authentication can wait until after the local MVP, but database models should
  not assume public data is private.
- Crafting recipes and item metadata need a reliable import path. Until that is
  available, use a small seed dataset for tests and early UI.
