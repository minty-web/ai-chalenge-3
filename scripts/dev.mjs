/**
 * Starts the Vite dev server and, if the file exists, the optional translation
 * proxy. Used by `npm run dev:full`. Written with no extra dependencies.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

const children = [];

function startProxy() {
  const envFile = path.join(root, '.env');
  const args = ['--env-file-if-exists', envFile, 'server/proxy.mjs'];
  const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: root });
  children.push(child);
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.warn(`[proxy] exited with code ${code} — the app keeps working with direct providers.`);
    }
  });
}

console.log('> ChatterSnap dev');
if (existsSync(path.join(root, '.env'))) {
  console.log('> .env found — starting the credential proxy on http://localhost:8787');
  startProxy();
} else {
  console.log('> no .env — skipping the credential proxy (not required)');
}

const vite = spawn(npx, ['vite'], { stdio: 'inherit', cwd: root, shell: isWin });
children.push(vite);

function shutdown() {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
vite.on('exit', shutdown);