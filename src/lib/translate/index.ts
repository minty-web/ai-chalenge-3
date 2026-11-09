import type { Lang, TranslateOutcome } from '../../types';
import {
  ALL_PROVIDERS,
  TranslationError,
  type RawTranslation,
  type TranslationProvider,
  offlineProvider,
} from './providers';

export interface TranslateOptions {
  from: Lang;
  to: Lang;
  provider: 'auto' | 'google' | 'mymemory' | 'libre' | 'offline';
  libreEndpoint: string;
  useProxyCredentials: boolean;
  signal: AbortSignal;
  /** When false, the offline phrasebook is not used and failures surface to the user. */
  allowOffline?: boolean;
}

export interface TranslateResult extends TranslateOutcome {
  /** Engines that were tried, in order, with the reason they failed. */
  attempts: { provider: string; error: string }[];
}

/** Memoised results — repeated identical sentences cost one API call. */
const cache = new Map<string, TranslateOutcome>();
const CACHE_LIMIT = 400;

function cacheKey(text: string, from: Lang, to: Lang, provider: string): string {
  return `${provider}|${from}>${to}|${text}`;
}

export function clearTranslationCache(): void {
  cache.clear();
}

/** Normalised sentence for dedupe + "avoid unnecessary API calls" checks. */
export function normalizeForCompare(text: string): string {
  return text
    .toLocaleLowerCase('fi-FI')
    .replace(/[\s]+/g, ' ')
    .trim()
    .replace(/[.,!?;:…"«»„“”]+$/g, '')
    .trim();
}

function remember(key: string, value: TranslateOutcome): void {
  if (cache.size >= CACHE_LIMIT) {
    const first = cache.keys().next();
    if (!first.done) cache.delete(first.value);
  }
  cache.set(key, value);
}

function chainFor(provider: TranslateOptions['provider'], allowOffline: boolean): TranslationProvider[] {
  const online = ALL_PROVIDERS.filter((p) => p.real);
  if (provider === 'offline') return allowOffline ? [offlineProvider] : [];
  const chosen = provider === 'auto' ? online : online.filter((p) => p.id === provider);
  return allowOffline ? [...chosen, offlineProvider] : chosen;
}

/**
 * Translate one sentence. Guarantees the result is tied to the text that was passed
 * in: the caller aborts the request when the entry changes, and the provider answer
 * is validated before it is returned.
 */
export async function translateText(text: string, opts: TranslateOptions): Promise<TranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new TranslationError('There is nothing to translate.', 'none');
  }

  const allowOffline = opts.allowOffline !== false;
  const chain = chainFor(opts.provider, allowOffline);
  if (chain.length === 0) {
    throw new TranslationError('No translation engine is enabled.', 'none');
  }

  const key = cacheKey(trimmed, opts.from, opts.to, opts.provider);
  const hit = cache.get(key);
  if (hit) return { ...hit, attempts: [] };

  const attempts: { provider: string; error: string }[] = [];

  for (const provider of chain) {
    if (opts.signal.aborted) {
      throw new TranslationError('Translation cancelled.', provider.id);
    }
    try {
      const raw: RawTranslation = await provider.translate({
        text: trimmed,
        from: opts.from,
        to: opts.to,
        signal: opts.signal,
        libreEndpoint: opts.libreEndpoint,
        useProxyCredentials: opts.useProxyCredentials,
      });
      const output = raw.text.trim();
      if (!output || raw.unusable) {
        throw new Error('The engine returned an empty translation.');
      }
      if (normalizeForCompare(output) === normalizeForCompare(trimmed)) {
        // Verbatim echo is not a translation; try the next engine.
        throw new Error('The engine returned the source text unchanged.');
      }
      const outcome: TranslateOutcome = {
        text: output,
        provider: provider.id,
        providerLabel: provider.label,
        fallback: !provider.real,
      };
      remember(key, outcome);
      return { ...outcome, attempts };
    } catch (err) {
      if (opts.signal.aborted) throw new TranslationError('Translation cancelled.', provider.id);
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({ provider: provider.id, error: message });
    }
  }

  const summary =
    attempts.length > 0
      ? attempts.map((a) => `${a.provider}: ${a.error}`).join(' · ')
      : 'No translation engine is available.';
  throw new TranslationError(
    allowOffline
      ? 'Every translation engine failed.'
      : 'Translation failed and the offline phrasebook is disabled.',
    'chain',
    summary,
  );
}

/** Cheap round-trip used by the settings "Test connection" button. */
export async function testProvider(opts: TranslateOptions): Promise<string> {
  const result = await translateText(opts.from === 'fi' ? 'Hei, mitä kuuluu?' : 'Hello, how are you?', {
    ...opts,
    allowOffline: false,
  });
  return `${result.providerLabel}: “${result.text}”`;
}