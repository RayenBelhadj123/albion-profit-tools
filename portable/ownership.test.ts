import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";

const modulePath = "./ownership.mjs";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function home() {
  if (!process.env.TMPDIR) throw new Error("TMPDIR required");
  await mkdir(process.env.TMPDIR, { recursive: true });
  const root = await mkdtemp(join(process.env.TMPDIR, "ownership ")); roots.push(root); return root;
}

test("exclusive concurrent claim refuses a live unverified owner, never deletes its lock", async () => {
  const { claim, release } = await import(modulePath);
  const root = await home();
  const results = await Promise.allSettled([claim(root, { waitMs: 30 }), claim(root, { waitMs: 30 })]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const winner = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ nonce: string }>;
  expect(JSON.parse(await readFile(join(root, "launcher.lock"), "utf8")).nonce).toBe(winner.value.nonce);
  await release(root, { ...winner.value, nonce: "unowned" });
  expect(JSON.parse(await readFile(join(root, "launcher.lock"), "utf8")).nonce).toBe(winner.value.nonce);
  await release(root, winner.value);
  await expect(readFile(join(root, "launcher.lock"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("dead PID lock recovers once, malformed locks and live unrelated PIDs are refused", async () => {
  const { claim, release } = await import(modulePath);
  const root = await home();
  await writeFile(join(root, "launcher.lock"), JSON.stringify({ pid: 2147483647, nonce: "a".repeat(64) }));
  const owner = await claim(root, { waitMs: 1000 });
  expect(owner.pid).toBe(process.pid);
  await release(root, owner);
  await writeFile(join(root, "launcher.lock"), "partial");
  await expect(claim(root, { waitMs: 30 })).rejects.toThrow(/lock/i);
  await writeFile(join(root, "launcher.lock"), JSON.stringify({ pid: process.pid, nonce: "b".repeat(64) }));
  await expect(claim(root, { waitMs: 30 })).rejects.toThrow(/running|verify/i);
});

test("control stop refuses a replacement owner before sending any request", async () => {
  const { claim, release, writeRun, controlRequest } = await import(modulePath);
  const root = await home();
  const original = await claim(root);
  await release(root, original);
  const replacement = await claim(root);
  let stopRequests = 0;
  const server = createServer((req, res) => {
    if (req.method === "POST") stopRequests++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ...replacement, phase: "stopping" }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await writeRun(root, { ...replacement, controlPort: (server.address() as { port: number }).port });
    await expect(controlRequest(root, "stop", original)).rejects.toThrow(/owner|changed/i);
    expect(stopRequests).toBe(0);
    expect(JSON.parse(await readFile(join(root, "launcher.lock"), "utf8")).nonce).toBe(replacement.nonce);
  } finally { await release(root, replacement); await new Promise<void>((r) => server.close(() => r())); }
});

test("reuse and stop require matching PID/nonce and authenticated loopback challenge", async () => {
  const { claim, release, writeRun, controlRequest } = await import(modulePath);
  const root = await home();
  const owner = await claim(root);
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.method + " " + req.url);
    if (req.headers.authorization !== `Bearer ${owner.nonce}`) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ pid: owner.pid, nonce: owner.nonce, phase: "ready", url: "http://localhost:31470" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await writeRun(root, { ...owner, controlPort: port });
    const reused = await claim(root, { waitMs: 1000 });
    expect(reused.existing.url).toBe("http://localhost:31470");
    await controlRequest(root, "stop");
    expect(requests).toContain("POST /stop");
    await writeFile(join(root, "run.json"), JSON.stringify({ ...owner, nonce: "c".repeat(64), controlPort: port }));
    await expect(controlRequest(root, "stop")).rejects.toThrow(/owner/i);
    await writeFile(join(root, "run.json"), JSON.stringify({ ...owner, controlPort: port, host: "remote.example" }));
    // Client ignores untrusted hosts and always dials literal loopback.
    expect((await controlRequest(root, "status")).phase).toBe("ready");
  } finally { await release(root, owner); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
