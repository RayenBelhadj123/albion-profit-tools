# Crafting Module

The crafting module should combine the spreadsheet-style clarity of
FallenAng3l crafting sheets with the broader calculator categories seen in
Albion profit tools.

## First version

The first version should support direct crafting profit for one output item.

Inputs:

- server
- crafted item
- output quantity or recipe runs
- output quality
- material purchase city
- crafting city or hideout
- output sell city
- material prices
- output price
- material quantities
- resource return rate
- focus enabled or disabled
- focus cost
- station fee per 100 nutrition
- nutrition used
- setup fee
- sales tax
- private price overrides

Outputs:

- gross material cost
- returned material quantity
- returned material value
- net material cost
- station fee
- market taxes and setup fees
- expected sale revenue
- expected net profit
- ROI
- profit per focus
- required material transport weight
- output transport weight
- confidence rating
- warnings

## Required price behavior

Every material and output price must have a source label:

- public market price
- private manual price
- private import price
- calculated estimate

Private prices can override public prices when they are newer, still valid, or
explicitly preferred by the user.

## Resource return rate

Resource return rate should be stored in basis points.

Examples:

- `1870` means `18.7%`
- `4500` means `45%`

Returned quantity should round down per material for the MVP. Later versions
can model Albion's exact return behavior more deeply if needed.

## Focus

The MVP should calculate both:

- profit without focus
- profit with focus

When focus is enabled and focus cost is known:

```text
profitPerFocus = extraProfitFromFocus / focusCost
```

If focus cost is unknown, show profit but warn that profit per focus is missing.

## Crafting plus transport

Crafting results should expose material and output weight so the app can later
recommend full operations:

```text
buy materials in Bridgewatch
transport materials to Lymhurst
craft item
transport output to Caerleon
sell item
```

The long-term goal is an operation planner, not only an isolated calculator.

## Refining

The first refining version follows the same calculation contract as direct
crafting, with a refining-specific view:

- compare no-focus and focus return rates
- include station fee, nutrition, market tax, and setup fee
- show required, returned, and net-consumed input quantities
- mark the primary raw material so the app can calculate the maximum buy price
  for a target ROI
- preserve source labels and timestamps for raw inputs, lower-tier refined
  inputs, and output prices
- keep refining city explicit because city bonuses and transport routes matter

Black Market flipping should remain a transport workflow, not a client-data
collection workflow: compare city sell orders to Black Market buy orders using
Albion Online Data and visible private buy-side overrides only.

## Later modules

Add these after direct crafting is reliable:

- food and potions
- transmuting
- artifact foundry
- crafting profit tree
- internal material crafting
- journals
- quality distribution
- reroll costs
- completed craft history
