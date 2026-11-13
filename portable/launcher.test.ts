import { afterEach, expect, test, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

const modulePath = "./launcher.mjs";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  if (!process.env.TMPDIR) throw new Error("TMPDIR required");
  await mkdir(process.env.TMPDIR, { recursive: true });
  const home = await mkdtemp(join(process.env.TMPDIR, "launcher spaces ")); roots.push(home);
  const order: string[] = [];
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, signalCode: null, connected: true,
    send: vi.fn(() => { order.push("app"); child.exitCode = 0; child.emit("exit", 0); }),
    kill: vi.fn(() => { child.exitCode = 1; child.emit("exit", 1); }) });
  const deps = {
    openDatabase: vi.fn(async () => ({ close: async () => { order.push("db"); } })),
    bootstrap: vi.fn(async () => 12),
    openSocket: vi.fn(async () => ({ getServerConn: () => "127.0.0.1:54321", stop: async () => { order.push("tcp"); } })),
    spawnApp: vi.fn(() => { setImmediate(() => child.emit("message", { type: "albion-listening" })); return child; }),
    fetchReady: vi.fn(async () => new Response(JSON.stringify({ count: 12 }))),
    openBrowser: vi.fn(async () => { order.push("browser"); }),
  };
  return { home, order, child, deps };
}

test.each(["START-ALBION.bat", "STOP-ALBION.bat"])("%s clears inherited Node injection before invoking the runtime", async (file) => {
  const text = await readFile(resolve(file), "utf8");
  const invoke = text.indexOf('"%~dp0runtime\\node.exe" "%~dp0portable\\');
  expect(invoke).toBeGreaterThan(0);
  for (const name of ["NODE_OPTIONS", "NODE_PATH"]) {
    const clear = text.indexOf(`set "${name}="`);
    expect(clear).toBeGreaterThan(0);
    expect(clear).toBeLessThan(invoke);
  }
});

test("isolated home, sanitized app environment, bundled Node and safe Windows browser arguments", async () => {
  const { portableHome, appOptions, browserCommand } = await import(modulePath);
  expect(portableHome({ LOCALAPPDATA: resolve("local appdata with spaces") })).toMatch(/AlbionTransport$/);
  expect(portableHome({ ALBION_PORTABLE_HOME: resolve("test isolated") })).toBe(resolve("test isolated"));
  expect(() => portableHome({})).toThrow(/LOCALAPPDATA/);
  const options = appOptions(resolve("bundle spaces"), 31470, "postgresql://local-only", {
    DATABASE_URL: "secret", NODE_OPTIONS: "--require bad", PGPASSWORD: "secret", PATH: "bad", SystemRoot: "C:/Windows",
  });
  expect(options.executable).toBe(process.execPath);
  expect(options.args.at(-1)).toBe(resolve("bundle spaces/app/server.js"));
  expect(options.options.shell).toBe(false);
  expect(options.options.env).toEqual({ SystemRoot: "C:/Windows", NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "31470", DATABASE_URL: "postgresql://local-only", NEXT_TELEMETRY_DISABLED: "1" });
  expect(browserCommand("http://localhost:31470", { SystemRoot: resolve("Windows") }).args).toEqual(["url.dll,FileProtocolHandler", "http://localhost:31470"]);
  expect(() => browserCommand("http://remote.example", { SystemRoot: "C:/Windows" })).toThrow();
});

test("occupied preferred port falls back to a free loopback port", async () => {
  const { choosePort } = await import(modulePath);
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try { expect(await choosePort((server.address() as { port: number }).port)).not.toBe((server.address() as { port: number }).port); }
  finally { await new Promise<void>((r) => server.close(() => r())); }
});

test("authenticated stop closes app then TCP then DB; ready requires actual catalog count; reuse opens once", async () => {
  const { startLauncher } = await import(modulePath);
  const f = await fixture();
  f.deps.fetchReady.mockResolvedValueOnce(new Response(JSON.stringify({ count: 0 })));
  const app = await startLauncher({ bundleRoot: resolve("bundle spaces"), home: f.home, deps: f.deps, timeoutMs: 2000 });
  try {
    expect(f.deps.fetchReady.mock.calls.length).toBeGreaterThan(1);
    expect(f.deps.openBrowser).toHaveBeenCalledWith(app.url);
    expect(app.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(f.deps.spawnApp.mock.calls[0]).toBeDefined();
    const reused = await startLauncher({ bundleRoot: resolve("bundle spaces"), home: f.home, deps: f.deps, noOpen: true });
    expect(reused.reused).toBe(true);
    expect(f.deps.openDatabase).toHaveBeenCalledTimes(1);
    const run = JSON.parse(await readFile(join(f.home, "run.json"), "utf8"));
    const unauthorized = await fetch(`http://127.0.0.1:${run.controlPort}/stop`, { method: "POST" });
    expect(unauthorized.status).toBe(403);
    const ownPath = "./ownership.mjs";
    const { controlRequest } = await import(ownPath);
    await controlRequest(f.home, "stop");
    await app.done;
    expect(f.order).toEqual(["browser", "app", "tcp", "db"]);
    await expect(readFile(join(f.home, "launcher.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await app.stop(); }
});

test("no-open and child exit cleanly release ownership; startup failure also closes resources", async () => {
  const { startLauncher } = await import(modulePath);
  const f = await fixture();
  const app = await startLauncher({ bundleRoot: resolve("bundle spaces"), home: f.home, deps: f.deps, noOpen: true });
  f.child.exitCode = 1; f.child.emit("exit", 1);
  await app.done;
  expect(f.deps.openBrowser).not.toHaveBeenCalled();
  expect(f.order).toEqual(["tcp", "db"]);
  const failed = await fixture();
  failed.deps.bootstrap.mockRejectedValueOnce(new Error("bad catalog"));
  await expect(startLauncher({ bundleRoot: resolve("bundle spaces"), home: failed.home, deps: failed.deps, noOpen: true })).rejects.toThrow(/bad catalog/);
  expect(failed.order).toEqual(["db"]);
  await expect(readFile(join(failed.home, "launcher.lock"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("readiness timeout never opens unknown app listener and cleans up owned child", async () => {
  const { startLauncher } = await import(modulePath);
  const f = await fixture();
  f.deps.spawnApp.mockImplementationOnce(() => f.child); // no owned listening confirmation
  await expect(startLauncher({ bundleRoot: resolve("bundle spaces"), home: f.home, deps: f.deps, timeoutMs: 30 })).rejects.toThrow(/start|ready/i);
  expect(f.deps.openBrowser).not.toHaveBeenCalled();
  expect(f.deps.fetchReady).not.toHaveBeenCalled();
  expect(f.order).toEqual(["app", "tcp", "db"]);
});

test("spawn failure releases ownership promptly and never tries killing a nonexistent process", async () => {
  const { startLauncher } = await import(modulePath);
  const f = await fixture();
  f.deps.spawnApp.mockImplementationOnce(() => { setImmediate(() => f.child.emit("error", new Error("ENOENT"))); return f.child; });
  f.child.connected = false;
  const started = Date.now();
  await expect(startLauncher({ bundleRoot: resolve("bundle spaces"), home: f.home, deps: f.deps, noOpen: true, timeoutMs: 1000 })).rejects.toThrow(/start bundled app/);
  expect(Date.now() - started).toBeLessThan(2000);
  expect(f.child.kill).not.toHaveBeenCalled();
  expect(f.order).toEqual(["tcp", "db"]);
  await expect(readFile(join(f.home, "launcher.lock"))).rejects.toMatchObject({ code: "ENOENT" });
}, 15_000);
