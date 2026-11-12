# Transport Calculations

This document defines the first calculation rules for Albion Transport.

## Inputs

An opportunity calculation needs:

- item id
- quality
- source city
- destination city
- purchase price in silver
- expected sale price in silver
- available quantity at the purchase price
- item weight
- available capital
- carrying capacity
- tax rate in basis points
- setup fee in silver
- optional route duration in minutes
- source price timestamp
- destination price timestamp
- maximum accepted data age

All silver values must be integers. Percentages should use basis points to avoid
floating-point errors. For example, `650` means `6.5%`.

## Quantity

The recommended quantity is the smallest valid limit:

- quantity available at acceptable source price
- quantity affordable with available capital
- quantity carryable with available capacity
- optional user maximum quantity

If available quantity is unknown, the result can still be shown, but confidence
must be reduced and the warning list must include `Quantity unknown`.

## Instant sale strategy

Use this when the destination buy order is used as the expected sale price.

```text
investment = purchasePrice * quantity
grossRevenue = expectedSalePrice * quantity
taxes = grossRevenue * taxRateBasisPoints / 10000
netRevenue = grossRevenue - taxes - setupFee
netProfit = netRevenue - investment
roiPercent = netProfit / investment * 100
totalWeight = itemWeight * quantity
profitPerKg = netProfit / totalWeight
profitPerMinute = netProfit / routeDurationMinutes
```

If `netProfit <= 0`, the item should be rejected unless the user explicitly asks
to show losing opportunities.

Market fee defaults:

- Premium fast sell: 4% sales tax.
- Non-Premium fast sell: 8% sales tax.
- Premium sell order: 4% sales tax plus 2.5% setup fee (6.5% total).
- Non-Premium sell order: 8% sales tax plus 2.5% setup fee (10.5% total).

Fast sell uses the destination's highest buy order and has no order setup fee.

## Sell order strategy

Use this when the destination sell price is used as an expected listing price.

Sell orders need setup fee and tax handling separately from instant sale. The
MVP may support instant sale first, but the data model should allow both.

The route scanner uses the destination's lowest current sell order as the
target listing price. This is an estimate rather than a guaranteed sale and
must add `Profit depends on sell order, not instant sale` to the warnings.

## Crafting market strategy

The crafting sheet follows the RAYEN workbook's separate market choices:

- Instant material buying uses the material city's lowest sell order.
- A material buy order uses the city's highest buy order as an estimate and is
  marked as order-dependent.
- Quick-selling crafted output uses the sell city's highest buy order.
- Listing crafted output uses the sell city's lowest sell order, adds the 2.5%
  setup fee, and is marked as order-dependent.
- Premium applies 4% sales tax; non-Premium applies 8% sales tax.

The station fee remains `nutrition consumed * fee per 100 nutrition / 100`.
Resource returns are rounded down per material after multiplying the recipe
quantity by the selected number of runs.

The refining sheet exposes leather, planks, metal bars, cloth, and stone blocks
and labels the corresponding bonus cities. Raw and previous-tier refined inputs
both participate in the selected refining return rate. Material buy-order and
instant-buy pricing, output quick-sell and sell-order pricing, Premium tax, and
the listing fee remain explicit inputs rather than hidden assumptions.

## Focus cost from specifications

Focus Cost Efficiency (FCE) reduces the catalog's base focus cost using:

```text
adjusted focus = ceil(base focus per run * runs * 0.5 ^ (FCE / 10000))
```

For standard crafting, the sheet uses `30 * mastery + 280 * selected item
specialization + 30 * total sibling specialization levels`. For refining, it
uses `30 * sum(T4..T8 specialization levels) + 250 * selected-tier
specialization`. Inputs are clamped to 0–100 per node. A manually entered total
focus cost remains an explicit override.

## Confidence

High confidence:

- source and destination prices are fresh
- quantity is known
- price source is private or recent public data
- route duration is known when sorting by profit per minute

Medium confidence:

- prices are fresh
- quantity is unknown, or one side uses public data only

Low confidence:

- one or both prices are stale
- one side is missing a timestamp
- quantity is unknown and the expected profit depends on high volume

## Warnings

Warnings should explain why a result is risky:

- `Source price is stale`
- `Destination price is stale`
- `Quantity unknown`
- `Private price overrides public price`
- `Missing route duration`
- `Fits capital but not full carrying capacity`
- `Profit depends on sell order, not instant sale`

## Mixed-load optimizer

The first optimizer should be simple and explainable:

1. Calculate valid single-item opportunities.
2. Remove stale or losing results.
3. Sort by profit per kilogram.
4. Add as much of the best item as capital and weight allow.
5. Continue down the ranked list until no useful capacity remains.
6. Compare against a second pass sorted by ROI.
7. Return the better plan by expected net profit.

Later versions can use a two-constraint knapsack optimizer with capital and
weight as constraints.
