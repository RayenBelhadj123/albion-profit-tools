import { afterEach, expect, test, vi } from "vitest";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const modulePath = "./stop.mjs";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
test("stopper authenticates and waits for owned lock release; never acts on unrelated state", async () => {
  const { stopLauncher } = await import(modulePath);
  const ownPath = "./ownership.mjs";
  const { claim, writeRun, release } = await import(ownPath);
  if (!process.env.TMPDIR) throw new Error("TMPDIR required");
  await mkdir(process.env.TMPDIR, { recursive: true });
  const home = await mkdtemp(join(process.env.TMPDIR, "stop spaces ")); roots.push(home);
  expect(await stopLauncher({ home })).toBe(false);
  const owner = await claim(home);
  const server = createServer((req, res) => {
    expect(req.headers.authorization).toBe(`Bearer ${owner.nonce}`);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ...owner, phase: "stopping" }));
    void release(home, owner);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await writeRun(home, { ...owner, controlPort: (server.address() as { port: number }).port });
    expect(await stopLauncher({ home, timeoutMs: 1000 })).toBe(true);
    await expect(readFile(join(home, "launcher.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(join(home, "launcher.lock"), JSON.stringify({ pid: process.pid, nonce: "a".repeat(64) }));
    await expect(stopLauncher({ home, timeoutMs: 30 })).rejects.toThrow(/verify|running|state/i);
  } finally { await new Promise<void>((r) => server.close(() => r())); }
});

test("stopper never stops a replacement installed between its two ownership reads", async () => {
  const ownPath = "./ownership.mjs";
  const real = await import(ownPath);
  const home = await mkdtemp(join(process.env.TMPDIR!, "stop replacement ")); roots.push(home);
  const original = await real.claim(home);
  let replacement: { pid: number; nonce: string } | undefined;
  let stops = 0;
  const server = createServer((req, res) => {
    if (req.method === "POST") stops++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ...replacement, phase: "stopping" }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  vi.resetModules();
  vi.doMock("./ownership.mjs", () => ({ ...real, readJson: async (path: string) => {
    const value = await real.readJson(path);
    if (!replacement && path === join(home, "launcher.lock")) {
      await real.release(home, original);
      replacement = await real.claim(home);
      await real.writeRun(home, { ...replacement, controlPort: (server.address() as { port: number }).port });
    }
    return value;
  } }));
  try {
    const { stopLauncher } = await import(modulePath);
    await expect(stopLauncher({ home, timeoutMs: 200 })).rejects.toThrow(/verify/i);
    expect(replacement).toBeDefined();
    expect(stops).toBe(0);
    expect((await real.readJson(join(home, "launcher.lock"))).nonce).toBe(replacement?.nonce);
  } finally {
    vi.doUnmock("./ownership.mjs"); vi.resetModules();
    await real.release(home, replacement ?? original);
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("batch entrypoints use only quoted bundled Node and preserve launcher arguments", async () => {
  for (const name of ["START", "STOP"]) {
    const source = await readFile(`${name}-ALBION.bat`, "utf8");
    expect(source).toContain('"%~dp0runtime\\node.exe"');
    expect(source).toContain(`"%~dp0portable\\${name === "START" ? "launcher" : "stop"}.mjs" %*`);
    expect(source).not.toMatch(/npm|npx|powershell|taskkill/i);
    expect(source).toMatch(/pause/i);
  }
});
