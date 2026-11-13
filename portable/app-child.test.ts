import { afterEach, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

test("real bundled-node style child reports only its bound port and drains via IPC SIGTERM", async () => {
  if (!process.env.TMPDIR) throw new Error("TMPDIR required");
  await mkdir(process.env.TMPDIR, { recursive: true });
  const root = await mkdtemp(join(process.env.TMPDIR, "child spaces ")); roots.push(root);
  const script = join(root, "server.cjs");
  const marker = join(root, "flushed.txt");
  await writeFile(script, `const http = require('node:http');
    const fs = require('node:fs');
    const server = http.createServer((req,res) => res.end('ok'));
    server.listen(0,'127.0.0.1', () => { process.env.PORT=String(server.address().port); process.send({type:'test-ready',port:server.address().port}); });
    process.on('SIGTERM', (signal) => server.close(() => { fs.writeFileSync(process.argv[2], String(signal)); process.exit(0); }));`);
  const child = spawn(process.execPath, ["--import", pathToFileURL(resolve("portable/app-child.mjs")).href, script, marker], { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
  try {
    const message = await new Promise<{ type: string; port: number }>((r, reject) => { child.once("message", r); child.once("error", reject); });
    expect(message.type).toBe("test-ready"); // PORT was not the configured port at bind time, so no false confirmation.
    const exited = new Promise<number | null>((r) => child.once("exit", r));
    child.send({ type: "albion-shutdown" });
    expect(await exited).toBe(0);
    expect(await readFile(marker, "utf8")).toBe("SIGTERM");
  } finally { if (child.exitCode === null) { const exited = new Promise((r) => child.once("exit", r)); child.kill(); await exited; } }
});
