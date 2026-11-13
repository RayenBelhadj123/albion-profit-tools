# Windows portable edition

Target: Windows 10/11, x64. This is the existing Albion Transport application with a bundled Node runtime and an embedded PostgreSQL-compatible PGlite database, not a Java/JAR application.

## Use on another laptop

1. Download the **portable ZIP**, not GitHub's source-code ZIP.
2. Extract the entire archive into a local writable folder.
3. Double-click `START-ALBION.bat`. Keep its console open while using the application. The launcher initializes the database and bundled public catalog, waits for a database-backed readiness check, then opens the browser.
4. Use `STOP-ALBION.bat` or Ctrl+C and wait for shutdown before turning off Windows or backing up the data folder. Do not terminate the console with its X button.

No separate Node.js, npm, PostgreSQL, Docker, administrator access, or developer-tool installation is needed. A browser is still required. The application and database bind to loopback, not the LAN. The default address is `http://localhost:31470`; an occupied port causes selection of another available port.

## Data and internet

The archive contains public metadata only: **11,270 items, 2,257 recipes, and 3,405 ingredient rows**. It contains no existing user database, accounts, sessions, private observations, spreadsheet imports, credentials, or logs. Create a local account on the new laptop.

Accounts, private observations, database state, and diagnostic logs are stored outside the application folder at `%LOCALAPPDATA%\AlbionTransport`. They persist across application restarts or replacement of the extracted application. Browser-only alerts remain in that browser's local storage; they are not a cloud service. Do not share the local data folder or its control-token files.

First-run database/catalog initialization does not need internet. **Fresh public prices, history, and remote item artwork require internet and availability of their external providers.** Public observations are not guaranteed live executable orders. Existing calculations can report missing/stale prices; do not interpret a successfully opened application as proof of current market coverage.

## Assembly

Work in the application repository. Install the main project dependencies and the separate runtime dependencies, then build with:

```sh
npm ci
npm ci --prefix portable/runtime --omit=optional --omit=peer --ignore-scripts
ALBION_PORTABLE_BUILD=1 NEXT_PUBLIC_PORTABLE_MODE=1 npm run build
```

The usual documented build-time database configuration is still required; it is not copied into the archive. Ordinary builds retain the existing hosted navigation/redirects.

Export only the approved public catalog from a database containing synchronized public item/recipe metadata:

```sh
node scripts/export-portable-catalog.mjs
```

The exporter reads `DATABASE_URL` privately and writes `output/portable-assets/public-catalog.json.gz`. Do not copy an existing `.env` or database into the distribution.

Obtain the official Windows x64 Node **22.23.5** executable and license. Verify `win-x64/node.exe` against that release's published checksum list. The assembler independently requires SHA-256:

```text
247e9693d316da9857e44990e5e11709f596f18112251b8026ec6eed80bdf38a
```

Then assemble into a new, nonexistent folder under this repository's `output` directory:

```sh
node scripts/package-windows-portable.mjs --node PATH_TO_VERIFIED_NODE_EXE --node-license PATH_TO_NODE_LICENSE --output output/windows/AlbionTransport
```

Archive the entire `AlbionTransport` directory. Retain `manifest.json`, bundled runtime files, migrations, public catalog, launchers, and dependency licenses. Do not add local state. The manifest records each packaged file's size/hash, the build ID, source revision, and whether the source tree was modified. It is an integrity inventory, not a digital signature.

## Verification captured November 13, 2026

- 207 tests across 39 files; TypeScript, ESLint and production build passed; production dependency audit reported zero vulnerabilities. Deterministic ownership regressions reject a replacement instance without sending it a stop request.
- Real extracted archive cold-started through the Windows batch file from a path with spaces, using a fresh isolated data directory and a PATH containing only Windows System32. Invalid inherited database and Node-option settings did not interfere.
- All 2,589 manifest-listed files matched their hashes after ZIP extraction. Application dependency licenses and compiled dependency notices were retained explicitly, because Next standalone tracing omitted them.
- First-run monitoring observed no non-loopback connections; observed listeners were loopback-only. This is a monitored initialization test, not a whole-OS network-disconnection test.
- The final assembler was exercised with both `.next/standalone/.next/static` and `.next/standalone/public` deliberately absent. It copied assets explicitly from the build/source directories. The extracted archive served all 19 HTML-referenced JavaScript files and its stylesheet with HTTP 200, correct content types, and nonempty bodies.
- A second launch reused the authenticated existing instance. Both graceful shutdowns completed, and ownership files were removed.
- Real Chromium visits reached Scanner, Market tools, Crafting, Refining, Cooking, Coverage, Private prices, and Account without JavaScript page errors. Scanner restore reached its interactive state. Remote item images were replaced with placeholders in the browser harness; artwork delivery was not verified.
- Real browser signup, authenticated private-price imports, and a scanner result using explicitly synthetic private observations passed. These test entries were created only in isolated QA data, never in the distribution.
- After shutdown/restart, the account/session and both exact private observations persisted. Anonymous and second-account checks did not expose the first account's private observations or private scanner price sources.
- Real crafting, cooking, and refining calculation endpoints returned HTTP 200 with calculation results. This does not guarantee current external market observations.

**Boundary:** no second physical laptop or clean Windows virtual machine was tested. Dependency-isolation and extracted-artifact tests were performed on the current Windows host. The ZIP is distributed separately from source code; pushing the source branch does not publish a GitHub download release.
