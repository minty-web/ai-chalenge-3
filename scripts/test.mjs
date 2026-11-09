/**
 * Test runner.
 *
 * The app's source uses Vite-style extensionless imports, which Node's native
 * type stripping cannot resolve. So each `*.test.ts` is bundled with esbuild
 * (already installed as part of Vite) into `.tmp-tests/`, then executed with
 * `node --test`. No extra dependency and no duplicated build config.
 */
import { build } from 'esbuild';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const outDir = path.join(root, '.tmp-tests');

async function findTests(dir = path.join(root, 'src')) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await findTests(full)));
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const tests = await findTests();
if (tests.length === 0) {
  console.error('No test files found under src/**/*.test.ts');
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const entryPoints = tests;

await build({
  entryPoints,
  outbase: path.join(root, 'src'),
  outdir: outDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'warning',
  // node:test and node:assert come from Node itself.
  external: ['node:*'],
});

const compiled = tests.map((file) => {
  const rel = path.relative(path.join(root, 'src'), file).replace(/\.ts$/, '.js');
  return path.join(outDir, rel);
});
console.log(`\n> running ${compiled.length} test file(s)\n`);

const child = spawn(process.execPath, ['--test', ...compiled], {
  stdio: 'inherit',
  cwd: root,
});

child.on('exit', async (code) => {
  await rm(outDir, { recursive: true, force: true });
  process.exit(code ?? 1);
});
