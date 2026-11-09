import type { Lang } from '../../types';
import { offlineTranslate } from './offline';

export interface ProviderContext {
  text: string;
  from: Lang;
  to: Lang;
  /** AbortSignal so a superseded request cannot write into the wrong entry. */
  signal: AbortSignal;
  /** LibreTranslate-compatible endpoint from settings. */
  libreEndpoint: string;
  /** Route through the bundled proxy so an API key never enters the bundle. */
  useProxyCredentials: boolean;
  /** BCP-47-ish hint for engines that want it (fi-FI / en-US). */
  hint?: string;
}

export interface RawTranslation {
  text: string;
  /** Set when the engine answered but the answer is unusable. */
  unusable?: boolean;
}

export interface TranslationProvider {
  id: 'google' | 'mymemory' | 'libre' | 'offline';
  label: string;
  /** Short description shown in Settings. */
  note: string;
  /** `true` when this provider is a real machine translation service. */
  real: boolean;
  translate(ctx: ProviderContext): Promise<RawTranslation>;
}

export class TranslationError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

const TIMEOUT_MS = 12_000;

/** fetch with a hard timeout that still honours an outer abort signal. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { signal: AbortSignal },
  ms = TIMEOUT_MS,
): Promise<Response> {
  const local = new AbortController();
  const onAbort = () => local.abort();
  init.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => local.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: local.signal });
  } catch (err) {
    if (init.signal.aborted) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`The translation service did not respond within ${ms / 1000}s.`);
    }
    throw new Error('Network request failed. Check your internet connection.');
  } finally {
    clearTimeout(timer);
    init.signal.removeEventListener('abort', onAbort);
  }
}

function decodeEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** Google's free `gtx` endpoint, the same one the web translator uses. */
export const googleProvider: TranslationProvider = {
  id: 'google',
  label: 'Google Translate',
  note: 'Free public endpoint (translate.googleapis.com). No key, generous limits.',
  real: true,
  async translate(ctx) {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
      `&sl=${ctx.from}&tl=${ctx.to}&q=${encodeURIComponent(ctx.text)}`;
    const res = await fetchWithTimeout(url, {
      signal: ctx.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Google Translate replied ${res.status}.`);
    }
    const data: unknown = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Google Translate returned an unexpected payload.');
    }
    const chunks = data[0] as unknown[];
    let out = '';
    for (const chunk of chunks) {
      if (Array.isArray(chunk) && typeof chunk[0] === 'string') out += chunk[0];
    }
    return { text: out.trim(), unusable: out.trim().length === 0 };
  },
};

/** MyMemory free API — rate limited but reliable and CORS enabled. */
export const myMemoryProvider: TranslationProvider = {
  id: 'mymemory',
  label: 'MyMemory',
  note: 'Free translation memory API. CORS enabled, daily character quota.',
  real: true,
  async translate(ctx) {
    const pair = `${ctx.from}|${ctx.to}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      ctx.text,
    )}&langpair=${encodeURIComponent(pair)}`;
    const res = await fetchWithTimeout(url, { signal: ctx.signal });
    if (!res.ok) throw new Error(`MyMemory replied ${res.status}.`);
    const data = (await res.json()) as {
      responseStatus?: number | string;
      responseDetails?: string;
      responseData?: { translatedText?: string };
    };
    const status = Number(data.responseStatus ?? 0);
    if (status >= 400) {
      throw new Error(data.responseDetails || `MyMemory rejected the request (${status}).`);
    }
    const text = decodeEntities(data.responseData?.translatedText ?? '').trim();
    if (!text) throw new Error('MyMemory returned an empty translation.');
    if (/^MYMEMORY WARNING/i.test(text) || /QUERY LENGTH LIMIT/i.test(text)) {
      throw new Error('MyMemory quota reached for today.');
    }
    return { text };
  },
};

/** LibreTranslate-compatible endpoint, optionally via the local credential proxy. */
export const libreProvider: TranslationProvider = {
  id: 'libre',
  label: 'LibreTranslate',
  note: 'Open-source engine. Needs a public endpoint; keys stay on the server.',
  real: true,
  async translate(ctx) {
    const url = ctx.useProxyCredentials ? '/api/translate' : ctx.libreEndpoint;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
      throw new Error('The LibreTranslate endpoint must start with http(s)://.');
    }
    const body: Record<string, unknown> = {
      q: ctx.text,
      source: ctx.from,
      target: ctx.to,
      format: 'text',
    };
    if (ctx.useProxyCredentials) body.endpoint = ctx.libreEndpoint;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      signal: ctx.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const hint =
        res.status === 403
          ? 'LibreTranslate requires an API key for this endpoint — add it in the .env file and enable the proxy.'
          : res.status === 429
            ? 'LibreTranslate rate limit reached.'
            : `LibreTranslate replied ${res.status}.`;
      throw new Error(hint);
    }
    const data = (await res.json()) as { translatedText?: string; error?: string };
    if (data.error) throw new Error(data.error);
    const text = (data.translatedText ?? '').trim();
    if (!text) throw new Error('LibreTranslate returned an empty translation.');
    return { text };
  },
};

export const offlineProvider: TranslationProvider = {
  id: 'offline',
  label: 'Offline phrasebook',
  note: 'Built-in word matcher. Used only when every online engine fails.',
  real: false,
  async translate(ctx) {
    const result = offlineTranslate(ctx.text, ctx.from);
    return { text: result.text };
  },
};

export const ALL_PROVIDERS: TranslationProvider[] = [
  googleProvider,
  myMemoryProvider,
  libreProvider,
  offlineProvider,
];