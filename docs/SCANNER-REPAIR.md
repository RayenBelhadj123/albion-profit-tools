# Scanner repair and verification

Verified locally on 2026-11-12. Scope is the supplied, truncated mission: immediate filtering of already-loaded market data, scanner lifecycle reliability, PR #1 review, private snapshot isolation, and a tested pull request. The remaining text after “when the necessary data is already” was not supplied.

## Reproduced baseline

On `main` at `a88cae5`, a real browser with deterministic API fixtures recorded:

- Premium change: two additional saved-coverage GETs.
- Quality change: two additional saved-coverage GETs.
- Rolling completion: pagination changed from page 2 to page 1.
- Combined ranking at 150,000 rows: `RangeError: Maximum call stack size exceeded`.

The browser fixtures are explicitly synthetic, not claimed to be real Albion prices. Separate real-service checks are described below.

## PR #1 review

Reviewed `e3c8276`; it was not merged or blindly cherry-picked.

| Change | Assessment |
| --- | --- |
| Separate automatic refresh from manual loading/pagination | Correct direction; retained and extended. |
| Recalculate Premium fees locally | Correct direction; also recalculate profitability and warnings in both directions across zero profit. |
| Keep the rolling effect stable | Correct direction, but the original PR captures stale selected item IDs. Read current IDs through a ref. |
| Replace preview plus expansion with one restore | Retained, but restore all qualities once rather than replace the session on quality changes. |
| Preserve rows on quality changes | Incomplete in the PR: subsequent snapshot requests can overwrite newer session prices. |
| Clear rows on market changes | Incomplete in the PR during active scans; late responses can contaminate a different server. |
| Observation/stock disclaimers | Correct; retained without promising executable orders or known stock. |

## Architecture

- `ScannerSession` owns the current market key, operation generation, cancellation controller, and per-market all-quality session pools.
- Market keys include server, destination, and sale method. Origin filtering is local because scans already collect all royal origins. A cold destination/sale-method change may require different prices; it is not simulated by changing fee rates on the wrong order side.
- Origin, category, quality, per-unit profit, ROI, freshness, sorting, and Premium operate on the loaded pool without requesting another snapshot or restarting the queue.
- Market switches immediately invalidate old operations. Every restore and streamed update checks operation ownership before publishing results. Returning to a warm market reuses its session pool.
- Background batches merge only checked items and preserve pagination, controls, and manual notices. Failure, cancellation, hidden tabs, and offline state do not consume queued work.
- Cancellation releases ownership synchronously, including when an upstream promise has not settled; a late `finally` cannot unlock a newer scan.
- Financial calculations remain BigInt-based. Per-unit limits use exact cross-multiplication, reject invalid/zero quantity, and exclude nonpositive profit unless “Show every origin/target price match” is selected.
- Iterative maximum calculation avoids argument-stack overflow on large all-quality pools. Sorting does not mutate the source pool.

## Private data

The prior saved-snapshot key did not identify the authenticated user, although results can contain private overrides. The repaired API resolves identity once per request and includes a versioned owner scope in every in-memory key, persistent snapshot, and quality slice. Legacy unscoped snapshots are deliberately not restored. Public market caches remain public-only.

This intentionally causes a cold restore for old snapshots: users can rebuild coverage from public cached observations or run another scan. No destructive migration or deletion of existing private data is required.

## Automated verification

Commands run successfully with a nonsecret placeholder database URL for tests/build:

```sh
npm ci
npm run prisma:generate
npm test
npm run typecheck
npm run lint
npm run build
npm audit
```

The integrated upgraded stack passed **182 tests in 32 files**, strict TypeScript, ESLint, and production build. The tests cover page lifecycle, market ownership/generations, hidden/offline queue pauses, late-response cancellation, exact per-unit thresholds, invalid quantities, bigint precision, repricing warnings, persistent snapshot ownership/legacy rejection, and ranking 150,000 rows.

The initial install reported 24 dependency advisories, including three critical. Targeted updates align Next.js and its ESLint config at 16.4.6, Prisma packages at 7.10.1, Zod at 4.6.7, and Vitest at 5.1.0. The narrowly scoped minimatch override addresses its transitive advisory. `npm audit` and `npm audit --omit=dev` both reported zero vulnerabilities at verification time. The ESM Vitest configuration avoids the upgraded loader warning.

### Production browser QA

```sh
npx playwright install chromium
# Start the production app on 127.0.0.1:3100, then:
npm run test:browser
# To use an installed Chrome rather than Playwright Chromium:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

`BASE_URL` defaults to `http://127.0.0.1:3100`; `QA_OUTPUT` defaults to ignored `output/playwright/scanner`. Playwright is a development-only dependency.

On the production build, **26 browser checks passed**, including 20 local filter/sort actions, latest selected priority IDs, stable queue alternation, background pagination, failed refresh retention, market-switch races, and a 390px viewport. No browser JavaScript errors were observed. Cold initial restore used one GET; the 20 display-only actions caused no additional scanner requests.

Measured action-to-assertion-plus-two-paints times on this machine: minimum **44 ms**, median **104.5 ms**, maximum **239 ms**. These include browser automation and rendering overhead, use a 390-row synthetic pool with paginated rendering, and are not a full-catalog production latency SLA. Screenshots and machine-readable timings are generated by the script; CI uploads them as explicitly fixture-backed artifacts.

## Real-service checks, separate from fixtures

A dedicated, newly created local Prisma development database was used; no existing user database or local `.env` was copied. All five migrations applied successfully. The public catalog sync imported **11,270 marketplace items**, **2,257 recipes**, and **3,405 ingredients**.

- Real `/api/items?summary=true` and item lookup returned the imported catalog and `T4_BAG` metadata.
- A real targeted scanner call fetched public Europe prices, evaluated one route, and returned one opportunity in show-all mode. Its net profit was negative; that is valid market data, not an artificially profitable test result.
- Two synthetic accounts and two explicit synthetic private observations were created only in the isolated QA database.
- Owner snapshot restore returned 200 with its private override; another signed-in user's restore returned 404; anonymous restore returned its separate public snapshot without private values.
- Direct database read-back confirmed the private snapshot was persisted and its prices were absent from the public compact cache and public observation rows. Restore responses included `Cache-Control: no-store`.

The account/service probe was a CLI HTTP probe without an Origin header, not a browser authentication-flow test. A local standalone request with Origin `http://127.0.0.1:3100` received the pre-existing auth origin guard's 403. Browser signup/login and reverse-proxy Origin handling need separate deployment verification; the scanner browser checks do not establish those flows.

## Delivery and remaining boundaries

- `.github/workflows/verify.yml` runs tests, typecheck, lint, build, production dependency audit, and the fixture-backed browser regression. Check the actual PR checks before calling remote CI green.
- No deployment, DNS change, production database migration, PR merge, or overwrite of the user's Desktop working tree was performed.
- The supplied `/transportations` reference served the APC interface, whereas this repository exposes `/black-market`; mapping that domain to this repository's actual deployment is unverified.
- Public prices are community observations. API retrieval time is not observation freshness, historical averages are not live buy orders, and quantities remain unknown where upstream does not provide them.
- Official API documentation was retrieved from `/api/v2/swagger_doc`: 100 requests/minute, 300/5 minutes per IP, compression required, and 429 responses include an epoch `RateLimit-Reset`. A compressed public-price probe succeeded. Existing API-wide cross-instance request budgeting and comprehensive 429 reset coordination are not added by this scanner-focused repair.
- Restoring the complete all-quality pool favors correct local filtering over small sliced responses. Larger real deployments may need owner-scoped observation pagination and a worker or server-side query index; they must not silently truncate candidates before local filtering.
- This is verified scanner repair work, not certification that every application route or production integration is production-ready.
