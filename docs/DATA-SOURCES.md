# Data Sources

Albion Transport uses public market data and private user data.

## Public market data

Public prices come from Albion Online Data:

- Europe: `https://europe.albion-online-data.com`
- Americas: `https://west.albion-online-data.com`
- Asia: `https://east.albion-online-data.com`

Current price endpoint shape:

```text
/api/v2/stats/prices/{itemIds}.json?locations={cities}&qualities={qualities}
```

The integration layer must:

- support configurable server selection
- validate responses with Zod
- preserve timestamps
- keep missing data distinct from zero values
- cache responses before showing them to the UI
- handle timeout and upstream errors
- respect URL length and request-rate limits

Successful public observations are persisted as last-known prices for royal
cities and the Black Market. If a later API response omits one side of a price,
the scanner may reuse the newest stored observation while preserving its
original market timestamp. These rows remain public data, are labeled `Last
known public price fallback`, and are still subject to the configured freshness
rules. A missing or zero response never overwrites a real stored observation.
The fallback loader reads both the compact latest-price cache and the
append-only observation history. If either store has a gap, it reconstructs
the newest valid buy and sell sides independently and retains their original
timestamps and quantities.

Historical estimates are volume weighted. Origin costs use the 60th weighted
percentile and destination revenue uses the 25th weighted percentile, making
both sides conservative for profit calculations. Estimates retain their sample
count, window, strategy, latest sale timestamp, and low-confidence label in the
observation history.

## Item metadata

Item identifiers, English display names, weights, and crafting metadata come
from the Albion Online Data Project's public `ao-bin-dumps` catalog. The item
sync validates both the raw and localized catalogs before writing them. English
names use each item's `LocalizedNames["EN-US"]` value, including enchanted item
identifiers, rather than attempting to generate a name from the internal ID.

Albion Online 2D item pages use the same Albion item identifiers and provide a
human-readable reference for checking individual names. The application uses
the bulk catalog during sync because the website does not expose its item pages
as a bulk API.

## Private data

Private data is stored in the application database and belongs to one user in
the MVP. The schema should still be ready for multiple users.

Private observations include:

- item id
- city
- quality
- order type: buy or sell
- price
- available quantity
- observed timestamp
- expiry timestamp
- optional note
- import source: manual, CSV, or API
- preferred override flag

Signed-in users can upload or paste CSV exported by Excel or Google Sheets at
`/private-prices`. Imports are limited to 500 rows and 256 KB, validate item IDs
against the catalog, and atomically write both the private table and unified
observation history. One user's rows are never returned to another user.

`/coverage` compares the tradable catalog against the latest compact cache for
the selected server, quality, and freshness limit. Its collection queue ranks
missing Black Market buy prices first, then recipe inputs and outputs, and can
copy unique item IDs for targeted scanning. Coverage measures only the market
sides the transport scanner requires: royal-city sells and Black Market buys.

## Price selection

All incoming market facts first use the unified `MarketPriceObservation`
shape. It records server, item, city, quality, order side, source, confidence,
observation time, collection time, and optional quantity. `price`, quantity,
and observation time remain nullable so missing coverage is never stored as a
zero-price order. Public rows have no owner; private and imported rows carry a
user ID.

Successful current-price responses append separate buy and sell observations.
The persistence layer checks the source timestamp and deduplicates repeated
scans before inserting them. Rows with a
zero price are normalized to missing and are not persisted as real orders.
Confidence is high through 60 minutes, medium through 24 hours, and low after
24 hours.

For every required market value, the application should select one price using
this order:

1. Fresh private preferred observation.
2. Fresh private observation newer than public data.
3. Fresh public market data.
4. Stale private or public data with warning.
5. Missing data.

The UI must show the selected source and the public/private alternatives when
available.

The final resolver is shared by transport, crafting, and refining. It selects:
fresh preferred private override, newer fresh manual observation, fresh live
public data, fresh spreadsheet/private import, last-known public data,
historical estimate, calculated estimate, then stale data or missing. Every
selection retains its timestamp, available quantity, source, and warnings.
Crafting and refining request seven-day history on demand only when an instant
material purchase or output target has no live, private, cached, or stored
historical value. Buy-order inputs are not estimated from historical sales,
because a completed-sale average is not evidence of a current buy order.
