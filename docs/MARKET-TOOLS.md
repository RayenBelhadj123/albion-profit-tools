# Database-independent market tools

Open `/market` or choose **Market tools** in the navigation.

This addition adapts useful behavior from the local Sundock reconstruction (`market.js` and the local-alert controls in `site.js`), not its page design, bundled data, or raw code. It uses Albion Transport's existing styles and public API validation.

## Included

- On-demand lookup for one exact item ID, region, city, and quality.
- Lowest sell and highest buy prices, with their original observation timestamps. A missing/zero upstream price is shown as not reported.
- Daily completed-sale history for the last seven days, a readable table/chart, and a directional comparison requiring at least three observations. It is not a price forecast or evidence of a live order.
- Public history cached in server memory for up to 15 minutes, separated by item, server, city, and quality. Current-price lookups reuse the existing short-lived cache.
- At most 20 browser-local price alerts, with explicit order side and integer-silver threshold. They run only when **Check saved alerts** is pressed. Missing, undated, excessively future-dated, or over-60-minute-old observations do not trigger an alert.

## Privacy and limitations

Alert thresholds are saved in this browser's localStorage only. Lookup requests contain the public item ID, city, server, quality, and whether history is needed; thresholds and alert IDs are not sent to the API or written to PostgreSQL. Anyone with access to the same browser profile can view local alerts. They are not encrypted, account-synced, push notifications, or background monitoring.

The new `/api/market-inspector` path has no database or session imports. It still needs a running application server and internet access to the public market service. The original full transport scanner still requires PostgreSQL; this feature does not silently replace private database records with public data.

On this project's existing Prisma local-development setup, restore a stopped database with `npx prisma dev start default` before starting the normal scanner. Do not reset, re-seed, or replace an existing database to resolve a stopped service. No Prisma version upgrade is needed for that case.

No personal workbooks, database records, credentials, or Sundock browser-storage entries are copied by this feature.
