/**
 * Optional ChatterSnap helper server — no third-party dependencies.
 *
 * Two jobs, both optional:
 *   1. `/api/translate` — forward a translation request to a LibreTranslate-
 *      compatible endpoint using an API key kept in `.env` (server side only,
 *      so the key never reaches the browser bundle).
 *   2. `--serve` — serve the built `dist/` folder so `npm start` gives you one
 *      origin for both the app and the API (no proxy configuration needed).
 *
 * Without this server the app still works: it calls Google's public gtx
 * endpoint and MyMemory directly from the browser. See README for details.
 *
 * Env vars (all optional):
 *   LIBRE_ENDPOINT   default https://libretranslate.com/translate
 *   LIBRE_API_KEY    sent as `api_key` in the JSON body
 *   PORT             default 8787
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8787);
const LIBRE_ENDPOINT = process.env.LIBRE_ENDPOINT ?? 'https://libretranslate.com/translate';
const LIBRE_API_KEY = process.env.LIBRE_API_KEY ?? '';
const SERVE_STATIC = process.argv.includes('--serve');

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleTranslate(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || '{}');
  } catch {
    sendJson(res, 400, { error: 'Body must be JSON' });
    return;
  }

  const { q, source, target } = payload ?? {};
  if (typeof q !== 'string' || !q.trim()) {
    sendJson(res, 400, { error: 'Missing "q" (text to translate)' });
    return;
  }
  if (!['fi', 'en'].includes(source) || !['fi', 'en'].includes(target)) {
    sendJson(res, 400, { error: '"source" and "target" must be "fi" or "en"' });
    return;
  }
  if (source === target) {
    sendJson(res, 400, { error: '"source" and "target" must differ' });
    return;
  }

  const body = { q, source, target, format: 'text' };
  if (LIBRE_API_KEY) body.api_key = LIBRE_API_KEY;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(LIBRE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      sendJson(res, upstream.status === 200 ? 502 : upstream.status, {
        error: `Translation endpoint returned HTTP ${upstream.status}`,
        detail: text.slice(0, 300),
      });
      return;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      sendJson(res, 502, { error: 'Translation endpoint did not return JSON' });
      return;
    }
    const translated = data?.translatedText;
    if (typeof translated !== 'string' || !translated.trim()) {
      sendJson(res, 502, { error: 'Translation endpoint returned no "translatedText"' });
      return;
    }
    sendJson(res, 200, { translatedText: translated, provider: 'libretranslate' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const timeout = err instanceof Error && err.name === 'AbortError';
    sendJson(res, timeout ? 504 : 502, {
      error: timeout ? 'Translation endpoint timed out' : 'Could not reach the translation endpoint',
      detail,
    });
  } finally {
    clearTimeout(timer);
  }
}

function serveStatic(req, res, pathname) {
  if (!existsSync(distDir)) {
    sendJson(res, 503, {
      error: 'dist/ not found — run "npm run build" first, or use "npm run dev" for development.',
    });
    return;
  }
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  let filePath = path.resolve(distDir, relative || 'index.html');
  if (!filePath.startsWith(distDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!existsSync(filePath)) {
    // Single-page app: unknown paths fall back to index.html.
    filePath = path.join(distDir, 'index.html');
    if (!existsSync(filePath)) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${PORT}`}`);
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      libreConfigured: Boolean(LIBRE_API_KEY),
      endpoint: LIBRE_ENDPOINT,
      servingStatic: SERVE_STATIC,
    });
    return;
  }

  if (pathname === '/api/translate') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Use POST' });
      return;
    }
    await handleTranslate(req, res);
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'Unknown API route' });
    return;
  }

  if (!SERVE_STATIC) {
    sendJson(res, 404, {
      error: 'Static serving is off. Start with "node server/proxy.mjs --serve" (npm start).',
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`> ChatterSnap helper server on http://127.0.0.1:${PORT}`);
  console.log(`  POST /api/translate → ${LIBRE_ENDPOINT}`);
  console.log(
    LIBRE_API_KEY
      ? '  API key loaded from .env (kept on the server, never sent to the browser)'
      : '  No LIBRE_API_KEY set — the proxy forwards without a key (many hosts reject that)',
  );
  if (SERVE_STATIC) {
    console.log(`  Serving ${distDir}`);
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT in .env to use another one.`);
  } else {
    console.error('Helper server failed:', err);
  }
  process.exitCode = 1;
});
