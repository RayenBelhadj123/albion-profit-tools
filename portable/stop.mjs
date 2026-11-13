import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { controlRequest, readJson } from './ownership.mjs';
import { portableHome } from './launcher.mjs';

export async function stopLauncher({ home = portableHome(), timeoutMs = 20_000 } = {}) {
  const path = join(home, 'launcher.lock');
  try { await access(path); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  let owner;
  try { owner = await readJson(path); await controlRequest(home, 'stop', owner); }
  catch { throw new Error('Cannot verify a running portable launcher. No process was killed. Check the launcher window and data-folder state.'); }
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const current = await readJson(path);
      if (current.pid !== owner.pid || current.nonce !== owner.nonce) return true;
    } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error('Shutdown is still pending. Check the launcher window; keep the data folder and do not force another instance.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(await stopLauncher() ? 'Albion Transport stopped and data saved.' : 'Albion Transport is not running.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
