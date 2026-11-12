<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Instructions

This is Albion Transport, a private-first Albion Online transportation and
trading decision tool built with Next.js, TypeScript, PostgreSQL, Prisma, and
Tailwind CSS.

Read `docs/PRODUCT.md`, `docs/CALCULATIONS.md`, `docs/DATA-SOURCES.md`,
`docs/CRAFTING.md`, `docs/COMPLIANCE.md`, and `docs/IMPLEMENTATION-PLAN.md`
before implementing domain features.

## Development Rules

- Use TypeScript strict mode.
- Keep business calculations separate from UI components.
- Validate external API responses with Zod.
- Treat missing prices and missing quantities as missing data, not zero.
- Preserve market timestamps and show data freshness.
- Keep public and private market data distinguishable.
- Never expose private database data in public endpoints.
- Use integer silver values and basis points for percentages.
- Add tests for financial and transport calculations.
- Do not add dependencies unless the project needs them.

## Business Rules

- Recommendations must respect available silver.
- Recommendations must respect carrying capacity.
- Recommendations must account for taxes and fees.
- Recommendations must expose selected price source: public, private manual,
  private import, or calculated.
- Private observations may override public market data only when the override is
  visible to the user.
- Quantity at an acceptable price is a first-class recommendation factor.
- Crafting calculations must include resource return rate, station fee, taxes,
  setup fee, focus/no-focus comparison, and profit per focus when focus cost is
  known.
- Do not implement private packet sniffing, memory reading, input automation,
  game-client modification, or any feature that intercepts Albion Online client
  traffic. Private data must come from manual entry, private imports, or normal
  application records.
