import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { clearTranslationCache, normalizeForCompare, translateText } from './index';
import { TranslationError } from './providers';

// The provider chain memoises successful results; each test starts clean.
beforeEach(() => clearTranslationCache());

function opts(overrides: Partial<Parameters<typeof translateText>[1]> = {}) {
  return {
    from: 'fi' as const,
    to: 'en' as const,
    provider: 'auto' as const,
    libreEndpoint: 'https://example.invalid/translate',
    useProxyCredentials: false,
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** Replace global fetch for the duration of one call. */
async function withFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    impl(String(input), init)) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('normalizeForCompare collapses whitespace and trailing punctuation', () => {
  assert.equal(normalizeForCompare('  Hei   siellä!  '), 'hei siellä');
  assert.equal(normalizeForCompare('Hello.'), normalizeForCompare('hello'));
});

test('the offline phrasebook is used last and is clearly marked as a fallback', async () => {
  await withFetch(
    async () => {
      throw new Error('network unreachable');
    },
    async () => {
      const result = await translateText('Hei', opts({ provider: 'google' }));
      assert.equal(result.provider, 'offline');
      assert.equal(result.fallback, true);
      assert.ok(result.attempts.length >= 1, 'the failed online attempt is recorded');
    },
  );
});

test('a successful engine result is returned without falling back', async () => {
  await withFetch(
    async () =>
      json([[['Hi there', 'Hei siellä', null, null]], null, 'en', null, null, null, 1, []], 200),
    async () => {
      const result = await translateText('Hei siellä', opts({ provider: 'google' }));
      assert.equal(result.provider, 'google');
      assert.equal(result.fallback, false);
      assert.equal(result.text, 'Hi there');
    },
  );
});

test('a verbatim echo is rejected and the next engine is tried', async () => {
  await withFetch(
    async (url) => {
      if (url.includes('googleapis')) {
        // Echo back the source unchanged — not a translation.
        return json([[['Hei siellä', 'Hei siellä', null, null]], null, 'en']);
      }
      return json({ responseStatus: 200, responseData: { translatedText: 'Hi there' } });
    },
    async () => {
      const result = await translateText('Hei siellä', opts());
      assert.equal(result.provider, 'mymemory');
      assert.equal(result.text, 'Hi there');
    },
  );
});

test('an empty translation is treated as a failure', async () => {
  await withFetch(
    async (url) => {
      if (url.includes('googleapis')) return json([[['   ', 'Hei', null, null]], null, 'en']);
      return json({ responseStatus: 200, responseData: { translatedText: 'Hi there' } });
    },
    async () => {
      const result = await translateText('Hei', opts());
      assert.equal(result.provider, 'mymemory');
    },
  );
});

test('with the phrasebook disabled a total failure throws with per-engine detail', async () => {
  await withFetch(
    async () => {
      throw new Error('offline now');
    },
    async () => {
      await assert.rejects(
        () => translateText('Hei', opts({ allowOffline: false })),
        (err: unknown) => {
          assert.ok(err instanceof TranslationError);
          assert.match(err.message, /Translation failed/);
          assert.ok(err.detail && err.detail.includes('google'), 'detail names the attempted engines');
          return true;
        },
      );
    },
  );
});

test('empty input is rejected before any network call', async () => {
  let called = false;
  await withFetch(
    async () => {
      called = true;
      return json({});
    },
    async () => {
      await assert.rejects(() => translateText('   ', opts()), TranslationError);
    },
  );
  assert.equal(called, false);
});

test('an aborted signal cancels instead of falling through to the next engine', async () => {
  const controller = new AbortController();
  await withFetch(
    async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    },
    async () => {
      await assert.rejects(
        () => translateText('Hei', opts({ signal: controller.signal })),
        (err: unknown) => err instanceof TranslationError,
      );
    },
  );
});
