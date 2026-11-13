import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const matches = (a, b) => a?.pid === b?.pid && a?.nonce === b?.nonce;
export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function validOwner(owner) {
  return Number.isSafeInteger(owner?.pid) && owner.pid > 0 && /^[a-f0-9]{64}$/.test(owner?.nonce);
}
async function exclusive(path, value) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
}

export async function writeRun(home, state) {
  const path = join(home, `run-${state.nonce}.tmp`);
  await exclusive(path, state);
  try { await rename(path, join(home, 'run.json')); } finally { await unlink(path).catch(() => {}); }
}

export async function controlRequest(home, action, expectedOwner) {
  const owner = await readJson(join(home, 'launcher.lock'));
  if (expectedOwner && !matches(owner, expectedOwner)) throw new Error('Portable launcher ownership changed. No replacement process was stopped.');
  const run = await readJson(join(home, 'run.json'));
  if (!validOwner(owner) || !matches(owner, run) || !alive(owner.pid) ||
      !Number.isInteger(run.controlPort) || run.controlPort < 1 || run.controlPort > 65535) {
    throw new Error('Cannot verify portable launcher ownership. No process was stopped.');
  }
  const response = await fetch(`http://127.0.0.1:${run.controlPort}/${action}`, {
    method: action === 'stop' ? 'POST' : 'GET', headers: { Authorization: `Bearer ${owner.nonce}` },
    signal: AbortSignal.timeout(1500), redirect: 'error',
  });
  if (!response.ok) throw new Error('Portable launcher authentication failed.');
  const status = await response.json();
  if (!matches(owner, status) || !['starting', 'ready', 'stopping'].includes(status.phase) ||
      (status.url !== undefined && !/^http:\/\/localhost:[1-9][0-9]{0,4}$/.test(status.url))) {
    throw new Error('Cannot verify portable launcher challenge response.');
  }
  return status;
}

export async function claim(home, { waitMs = 60_000 } = {}) {
  await mkdir(home, { recursive: true });
  const path = join(home, 'launcher.lock');
  const owner = { pid: process.pid, nonce: randomBytes(32).toString('hex') };
  const deadline = Date.now() + waitMs;
  do {
    try { await exclusive(path, owner); return owner; } catch (error) { if (error.code !== 'EEXIST') throw error; }
    let previous;
    try { previous = await readJson(path); } catch { /* An owner may still be writing its exclusive lock. */ }
    if (validOwner(previous) && !alive(previous.pid)) {
      // Serialize recovery, then re-read under the guard. Never unlink a replacement lock.
      const recovery = join(home, 'launcher-recovery.lock');
      let guard;
      try { guard = await open(recovery, 'wx', 0o600); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      if (guard) {
        try {
          const current = await readJson(path).catch(() => null);
          if (matches(current, previous) && !alive(current.pid)) await unlink(path);
        } finally { await guard.close(); await unlink(recovery); }
        continue;
      }
    }
    if (validOwner(previous) && alive(previous.pid)) {
      try {
        const status = await controlRequest(home, 'status');
        if (status.phase === 'ready') return { existing: status };
      } catch { /* A live but unverified process is never killed or replaced. */ }
    }
    if (Date.now() >= deadline) break;
    await delay(Math.min(100, Math.max(1, deadline - Date.now())));
  } while (Date.now() <= deadline);
  throw new Error('Another launcher is running or its lock cannot be verified. Wait for startup, or close its window and retry. Keep your data folder.');
}

export async function release(home, owner) {
  const path = join(home, 'launcher.lock');
  const current = await readJson(path).catch(() => null);
  if (!matches(current, owner)) return;
  const run = await readJson(join(home, 'run.json')).catch(() => null);
  if (matches(run, owner)) await unlink(join(home, 'run.json'));
  await unlink(path);
}
