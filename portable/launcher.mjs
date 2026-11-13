import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { bootstrap } from './bootstrap.mjs';
import { claim, release, writeRun } from './ownership.mjs';

const failedSpawns = new WeakSet();

export function portableHome(env = process.env) {
  const home = env.ALBION_PORTABLE_HOME || (env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'AlbionTransport'));
  if (!home || !isAbsolute(home)) throw new Error('Set LOCALAPPDATA or an absolute ALBION_PORTABLE_HOME to a writable local data folder.');
  return resolve(home);
}

export function appOptions(bundleRoot, port, databaseUrl, inherited = process.env) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA', 'USERPROFILE']) {
    if (inherited[key]) env[key] = inherited[key];
  }
  Object.assign(env, { NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1' });
  return { executable: process.execPath,
    args: ['--import', pathToFileURL(join(bundleRoot, 'portable', 'app-child.mjs')).href, join(bundleRoot, 'app', 'server.js')],
    options: { cwd: join(bundleRoot, 'app'), env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] } };
}

export function browserCommand(url, env = process.env) {
  if (!/^http:\/\/localhost:[1-9][0-9]{0,4}$/.test(url) || !env.SystemRoot || !isAbsolute(env.SystemRoot)) throw new Error('Cannot open browser safely. Open the printed localhost address manually.');
  return { executable: join(env.SystemRoot, 'System32', 'rundll32.exe'), args: ['url.dll,FileProtocolHandler', url] };
}
async function openBrowser(url) {
  const command = browserCommand(url);
  await new Promise((resolve, reject) => execFile(command.executable, command.args, { shell: false, windowsHide: true, timeout: 5000 }, (error) => error ? reject(error) : resolve()));
}

export async function choosePort(preferred = 31470) {
  const reserve = (port) => new Promise((resolve, reject) => {
    const server = netServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      const selected = server.address().port;
      server.close((error) => error ? reject(error) : resolve(selected));
    });
  });
  try { return await reserve(preferred); } catch (error) { if (error.code !== 'EADDRINUSE') throw error; return reserve(0); }
}

function defaults(bundleRoot) {
  let runtime;
  const load = () => runtime ??= createRequire(join(bundleRoot, 'runtime', 'package.json'));
  return {
    openDatabase: (path) => load()('@electric-sql/pglite').PGlite.create(path),
    bootstrap,
    openSocket: async (db) => {
      const { PGLiteSocketServer } = load()('@electric-sql/pglite-socket');
      const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 1 });
      await socket.start(); return socket;
    },
    spawnApp: ({ executable, args, options }) => spawn(executable, args, options),
    fetchReady: (url) => fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'error' }),
    openBrowser,
  };
}

async function stopChild(child) {
  if (!child || failedSpawns.has(child) || child.exitCode !== null || child.signalCode) return;
  let finished = false;
  const exited = new Promise((resolve) => child.once('exit', () => { finished = true; resolve(); }));
  try { if (child.connected) child.send({ type: 'albion-shutdown' }, () => {}); } catch { /* Owned child may already be exiting. */ }
  let timer;
  await Promise.race([exited, new Promise((r) => { timer = setTimeout(r, 8000); })]); clearTimeout(timer);
  if (!finished) {
    child.kill(); // Only the child handle created by this launcher, never a stored PID.
    await Promise.race([exited, new Promise((r) => { timer = setTimeout(r, 3000); })]); clearTimeout(timer);
    if (!finished) throw new Error('Owned app did not stop. Close its launcher window before restarting; keep your data folder.');
  }
}

export async function startLauncher({ bundleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'), home = portableHome(),
  noOpen = false, deps: injected = {}, timeoutMs = 90_000, signal } = {}) {
  const deps = { ...defaults(bundleRoot), ...injected };
  const owner = await claim(home);
  if (owner.existing) {
    if (!noOpen) await deps.openBrowser(owner.existing.url).catch(() => console.error('Open the printed localhost address manually.'));
    return { reused: true, url: owner.existing.url, done: Promise.resolve(), stop: async () => {} };
  }
  let db, socket, child, control, log, phase = 'starting', url, initialized = false, cleanup;
  let childError, listening = false;
  const abort = new AbortController();
  const onAbort = () => { abort.abort(); if (initialized) void stop().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) abort.abort();
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const check = () => {
    if (abort.signal.aborted) throw new Error('Portable startup cancelled.');
    if (childError) throw childError;
  };
  async function stop() {
    if (cleanup) return cleanup;
    phase = 'stopping'; abort.abort();
    cleanup = (async () => {
      try {
        await stopChild(child);
        if (socket) await socket.stop();
        if (db) await db.close(); // PGlite close flushes filesystem persistence.
        if (control) await new Promise((resolve) => { control.close(resolve); control.closeAllConnections(); });
        if (log) await new Promise((resolve) => log.end(resolve));
        await release(home, owner);
      } finally {
        signal?.removeEventListener('abort', onAbort);
        finish({ failed: Boolean(childError) });
      }
    })();
    return cleanup;
  }
  try {
    check();
    await mkdir(join(home, 'logs'), { recursive: true });
    log = createWriteStream(join(home, 'logs', `app-${Date.now()}.log`), { flags: 'a', mode: 0o600 });
    await new Promise((resolve, reject) => { log.once('open', resolve); log.once('error', reject); });
    log.on('error', () => { childError = new Error('Cannot write app log. Check free disk space and data-folder permissions.'); onAbort(); });
    control = httpServer((request, response) => {
      if (request.headers.authorization !== `Bearer ${owner.nonce}`) { response.writeHead(403).end(); return; }
      if (!((request.method === 'GET' && request.url === '/status') || (request.method === 'POST' && request.url === '/stop'))) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ ...owner, phase, ...(url ? { url } : {}) }));
      if (request.url === '/stop') setImmediate(onAbort);
    });
    control.requestTimeout = 3000; control.headersTimeout = 3000;
    await new Promise((resolve, reject) => { control.once('error', reject); control.listen(0, '127.0.0.1', resolve); });
    await writeRun(home, { ...owner, controlPort: control.address().port });
    check();
    db = await deps.openDatabase(join(home, 'db')); check();
    const count = await deps.bootstrap(db, { migrationDir: join(bundleRoot, 'data', 'migrations'), catalogPath: join(bundleRoot, 'data', 'public-catalog.json.gz') }); check();
    socket = await deps.openSocket(db); check();
    const address = socket.getServerConn();
    if (!/^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(address)) throw new Error('Embedded database did not bind to loopback.');
    const dbPort = Number(address.split(':')[1]);
    const databaseUrl = `postgresql://postgres@localhost:${dbPort}/postgres?host=127.0.0.1&connection_limit=1`;
    const port = await choosePort(); check();
    url = `http://localhost:${port}`;
    child = deps.spawnApp(appOptions(bundleRoot, port, databaseUrl));
    child.stdout?.pipe(log, { end: false }); child.stderr?.pipe(log, { end: false });
    child.on('error', () => {
      if (!child.pid) failedSpawns.add(child);
      childError = new Error('Cannot start bundled app. Re-extract the complete archive and check the app log.');
      if (initialized) void stop().catch(() => {});
    });
    child.on('exit', () => {
      if (phase !== 'stopping') {
        childError = new Error('Bundled app exited. See the app log in your data folder.');
        if (initialized) void stop().catch(() => {});
      }
    });
    child.on('message', (message) => { if (message?.type === 'albion-listening') listening = true; });
    const deadline = Date.now() + timeoutMs;
    let ready = false;
    while (Date.now() < deadline) {
      check();
      if (listening) {
        try {
          const response = await deps.fetchReady(`http://127.0.0.1:${port}/api/items?summary=true`);
          const body = response.ok && await response.json();
          if (Number.isSafeInteger(body?.count) && body.count === count && count > 0) { ready = true; break; }
        } catch { /* Startup may not yet be serving database-backed requests. */ }
      }
      await delay(Math.min(100, Math.max(1, deadline - Date.now())));
    }
    check();
    if (!ready) throw new Error('App did not become ready. See the app log; re-extract the archive if bundled files are missing.');
    phase = 'ready'; initialized = true;
    if (!noOpen) await deps.openBrowser(url).catch(() => console.error('Open the printed localhost address manually.'));
    return { url, done, stop, reused: false };
  } catch (error) { await stop(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const signal = () => controller.abort();
  process.on('SIGINT', signal); process.on('SIGTERM', signal);
  try {
    const app = await startLauncher({ noOpen: process.argv.includes('--no-open'), signal: controller.signal });
    console.log(`Albion Transport: ${app.url}`);
    if (!app.reused) console.log('Keep this window open. Press Ctrl+C or use STOP-ALBION.bat to stop.');
    const result = await app.done;
    if (result?.failed) { console.error('App exited unexpectedly. See the app log in your data folder.'); process.exitCode = 1; }
  } catch (error) { console.error(`Albion Transport could not start: ${error.message}`); process.exitCode = 1; }
  finally { process.off('SIGINT', signal); process.off('SIGTERM', signal); }
}
