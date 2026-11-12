# Local setup and rolling coverage

Requires Node.js supported by the installed Next.js release, npm, and PostgreSQL. This is a Node.js app, not Java; there is no executable JAR.

1. Copy `.env.example` to `.env` and configure the database connection.
2. Prepare the application:

   ```sh
   npm ci
   npm run prisma:generate
   npx prisma migrate deploy
   npm run prisma:seed
   npm run items:sync
   npm run build
   ```

3. On Windows, double-click `start-local.bat`. Alternatively, run `npm start`. Visit `http://127.0.0.1:3000/black-market`.

Development: `npm run dev -- --hostname 127.0.0.1`.

The production build prepares `.next/standalone` with static/public assets. It still requires Node.js and your configured database. A local web server does not make a hosted database offline. Credentials, builds, logs, and personal spreadsheets are excluded from Git.

## Rolling coverage

Enable **Rolling coverage: priority matches + catalog batches** on the scanner.

- One job runs at a time; the next is scheduled after completion. Busy manual scans do not consume queued work.
- Up to 50 distinct selected/saved-match items alternate with up to 50 catalog items in stable ID order. Both paths check all five qualities. Priority items rotate rather than sending an unbounded list.
- A cursor tracks the catalog pass. Completing a pass starts another; there is no promised 15-minute sweep.
- Successful jobs wait at least five seconds, with longer pauses for slow requests. Failures retry without advancing the cursor, using exponential delays capped at two minutes.
- New jobs pause in hidden tabs or offline. Disable rolling coverage or cancel to stop automatic work. **Keep the page open:** this is not an always-on worker or a push market feed.
- Catalog batches use current and last-known public prices without expensive historical backfills. Public price-cache writes remain, but rolling batches do not overwrite or re-date the saved full-scan snapshot. The tracker shows items checked, not guaranteed fresh observations. Updated opportunities are kept for the current page session.
- Manual scans retain their historical fallback and existing source/age labels. Missing data remains missing, not zero.

Data can remain missing or stale regardless of polling frequency. The app does not capture or automate the game client.

## Verify

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Game artwork and third-party data belong to their respective owners. This is an independent community tool.
