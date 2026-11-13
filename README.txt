Albion Transport - Windows portable edition (Windows 10/11 x64)

Extract the WHOLE archive into a writable local folder, then double-click
START-ALBION.bat. Paths with spaces are supported. No installed Node, npm,
PostgreSQL, Docker, administrator rights or developer tools are needed.
Keep the launcher console open while using the app. The browser opens only
after the local database and public item catalog are ready. First startup
initializes the bundled catalog offline; it does not download metadata.
Internet is used for fresh market prices, history and item images.

Use STOP-ALBION.bat or press Ctrl+C in the launcher console to stop and save.
Wait for shutdown before shutting down Windows, moving files or making backups.
Do not close the console with its X button: Windows may terminate it abruptly.
A second start reuses an authenticated ready instance; it never takes over an
unknown listener or kills an unrelated process. The app and database listen
only on this computer. The browser address is http://localhost:PORT, normally
port 31470. If it is occupied, a free port is selected and printed.

Accounts, private entries and all local runtime data stay in
%LOCALAPPDATA%\AlbionTransport (db, logs, launcher.lock and run.json).
Your data is separate from the extracted application folder. Restarting or
replacing the application archive preserves your accounts and observations.
The archive contains public metadata only; create a new account on this laptop.
Do not distribute your data folder or copy credentials into the application.
Keep run.json and launcher.lock private: they contain the local control token.

If the browser does not open, enter the printed localhost address manually.
If startup fails, read the console and the app log in the data folder. Confirm
that the full archive was extracted and the data folder has free disk space
and write permission. Keep the entire data folder when asking for help; share
only reviewed error text, never private database files or control tokens.
Changed or missing migration checksums are refused without resetting data.
Restore the matching application archive, then retry. An unverified live lock
is never removed automatically. Close the existing launcher normally or reboot
Windows before retrying. A dead-PID lock is recovered automatically. A malformed
lock or interrupted recovery guard needs manual diagnosis; do not delete the
database to work around it.

QA: set ALBION_PORTABLE_HOME to an absolute isolated writable folder before
starting BOTH batch files. START-ALBION.bat --no-open suppresses the browser.
This override selects that folder for the database, logs and runtime state.
Inherited DATABASE_URL and Node options are ignored; the launcher supplies its
own embedded database connection and starts the bundled runtime directly.

Assembly contract (maintainers): root/runtime includes node.exe, package.json
and the verified PGlite modules; root/app includes the Next standalone server,
static assets and public files; root/portable includes these .mjs helpers only
(exclude portable/runtime and tests); root/data includes migrations/<id>/migration.sql
and public-catalog.json.gz. Build the portable app with ALBION_PORTABLE_BUILD=1
and NEXT_PUBLIC_PORTABLE_MODE=1; ordinary builds keep the hosted navigation.
Do not include .env files, credentials, private exports or an existing database.
