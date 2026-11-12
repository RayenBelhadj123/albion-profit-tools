# Codex Instructions

## Project

This is a production-quality Albion Online transportation and trading
application built with Next.js, TypeScript, PostgreSQL, Prisma and Tailwind CSS.

## Development rules

- Use TypeScript strict mode.
- Do not use `any` unless clearly justified.
- Keep business calculations separate from UI components.
- Validate external API responses with Zod.
- Never expose private database data in public endpoints.
- Never store secrets in source code.
- Use environment variables for configuration.
- Add tests for all financial calculations.
- Treat missing prices as missing data, not as zero.
- Treat timestamps and data freshness as first-class information.
- Keep commits and changes focused.
- Run lint, type checking and tests after changes.
- Explain important architectural decisions.
- Do not add dependencies without explaining why.

## Business rules

- All silver values must avoid floating-point errors.
- Profit calculations must include taxes and fees.
- Recommendations must respect available capital.
- Recommendations must respect maximum carrying capacity.
- Public and private market data must remain distinguishable.
- Each private record must belong to an authenticated user.
- Every opportunity must show the source and age of its data.