import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechEngine } from './speechEngine';
import type {
  RecognitionFailure,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
} from './speech';

/**
 * These tests drive `SpeechEngine` with a fake `SpeechRecognition` that can
 * reproduce the behaviour that caused words to multiply: Chrome re-fires a
 * result it has already finalised with *revised, longer* text, so "Moi" arrives
 * final, then "Moi miten" final, then "Moi miten menee" final. Appending those
 * gave "Moi Moi Moi miten Moi miten menee".
 */

// ---- fake window -----------------------------------------------------------

type Timer = { id: number; at: number; fn: () => void };

let clock = 0;
let nextTimerId = 1;
let timers: Timer[] = [];

function fakeSetTimeout(fn: () => void, ms = 0): number {
  const id = nextTimerId++;
  timers.push({ id, at: clock + ms, fn });
  return id;
}

function fakeClearTimeout(id: number): void {
  timers = timers.filter((t) => t.id !== id);
}

/** Advances virtual time, running every timer that falls due. */
function tick(ms: number): void {
  clock += ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= clock).sort((a, b) => a.at - b.at)[0];
    if (!due) return;
    timers = timers.filter((t) => t.id !== due.id);
    due.fn();
  }
}

// ---- fake recogniser -------------------------------------------------------

let instances: FakeRecognition[] = [];

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null = null;
  onerror: ((e: { error: string; message?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  started = false;

  constructor() {
    instances.push(this);
  }

  start(): void {
    this.started = true;
    this.onstart?.();
  }

  stop(): void {
    this.started = false;
    this.onend?.();
  }

  abort(): void {
    this.started = false;
  }
}

// ---- helpers ---------------------------------------------------------------

function alt(text: string) {
  return { transcript: text, confidence: 1 };
}

function utter(text: string, isFinal: boolean) {
  return { isFinal, length: 1, 0: alt(text) };
}

/** One recognition event carrying `results`, as Chrome delivers it. */
function fire(rec: FakeRecognition, results: ReturnType<typeof utter>[]): void {
  rec.onresult?.({ resultIndex: 0, results } as unknown as SpeechRecognitionEventLike);
}

interface Harness {
  engine: SpeechEngine;
  rec: () => FakeRecognition;
  emitted: string[];
  interim: string[];
  failures: RecognitionFailure[];
  listening: boolean[];
}

function harness(locale = 'fi-FI'): Harness {
  const emitted: string[] = [];
  const interim: string[] = [];
  const failures: RecognitionFailure[] = [];
  const listening: boolean[] = [];
  const engine = new SpeechEngine(locale, {
    onFinalSentence: (s) => emitted.push(s),
    onInterim: (t) => interim.push(t),
    onListeningChange: (l) => listening.push(l),
    onFailure: (f) => failures.push(f),
  });
  return {
    engine,
    rec: () => instances[instances.length - 1],
    emitted,
    interim,
    failures,
    listening,
  };
}

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  clock = 0;
  nextTimerId = 1;
  timers = [];
  instances = [];
  const fakeWindow = {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    SpeechRecognition: FakeRecognition,
  };
  (globalThis as { window?: unknown }).window = fakeWindow;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

// ---- tests -----------------------------------------------------------------

describe('SpeechEngine duplicate suppression', () => {
  it('does not repeat words when a final result is revised and re-finalised', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();
    assert.equal(rec.lang, 'fi-FI');

    // Exactly what Chrome does: the same index, three times, each marked final.
    fire(rec, [utter('Moi', true)]);
    fire(rec, [utter('Moi miten', true)]);
    fire(rec, [utter('Moi miten menee', true)]);
    fire(rec, [utter('Moi miten menee?', true)]);

    assert.deepEqual(h.emitted, ['Moi miten menee?']);
  });

  it('never emits text with immediately repeated words', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    // The sequence from the bug report.
    const growing = [
      'Moi',
      'Moi miten',
      'Moi miten menee',
      'Moi miten menee Mitä',
      'Moi miten menee Mitä teet',
      'Moi miten menee Mitä teet?',
    ];
    for (const text of growing) fire(rec, [utter(text, true)]);

    assert.deepEqual(h.emitted, ['Moi miten menee Mitä teet?']);
    for (const line of h.emitted) {
      assert.doesNotMatch(line, /\b(\w+)\s+\1\b/i, `repeated word in ${JSON.stringify(line)}`);
    }
  });

  it('emits two utterances separately when the browser advances the index', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Hei.', true)]);
    fire(rec, [utter('Hei.', true), utter('Mitä kuuluu?', true)]);

    assert.deepEqual(h.emitted, ['Hei.', 'Mitä kuuluu?']);
  });

  it('keeps interim text out of the notebook', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Moi miten', false)]);
    assert.deepEqual(h.emitted, []);
    assert.equal(h.interim.at(-1), 'Moi miten');

    fire(rec, [utter('Moi miten menee.', true)]);
    assert.deepEqual(h.emitted, ['Moi miten menee.']);
    assert.equal(h.interim.at(-1), '');
  });

  it('writes a sentence once when the same final arrives twice', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Kiitos.', true)]);
    fire(rec, [utter('Kiitos.', true)]);

    assert.deepEqual(h.emitted, ['Kiitos.']);
  });
});

describe('SpeechEngine sentence boundaries', () => {
  it('waits for a pause before writing an unterminated fragment', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Minulla on huomenna', true)]);
    assert.deepEqual(h.emitted, [], 'a fragment must not be written while speech continues');

    tick(900);
    assert.deepEqual(h.emitted, ['Minulla on huomenna']);
  });

  it('writes an unterminated fragment only once across repeated revisions', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Minulla on', true)]);
    tick(900);
    // The browser then revises the same result; the words already written stay
    // written, and nothing is added twice.
    fire(rec, [utter('Minulla on', true)]);
    tick(900);

    assert.deepEqual(h.emitted, ['Minulla on']);
  });

  it('holds back a trailing fragment after a terminated sentence', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Hei. Mitä kuuluu', true)]);
    assert.deepEqual(h.emitted, ['Hei.']);

    tick(900);
    assert.deepEqual(h.emitted, ['Hei.', 'Mitä kuuluu']);
  });

  it('emits a long run on stop even without punctuation', async () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Tämä lause ei lopu pisteeseen', true)]);
    await h.engine.stop();

    assert.deepEqual(h.emitted, ['Tämä lause ei lopu pisteeseen']);
  });

  it('splits one final result containing several sentences', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Hei. Mitä kuuluu? Kiitos hyvää.', true)]);

    assert.deepEqual(h.emitted, ['Hei.', 'Mitä kuuluu?', 'Kiitos hyvää.']);
  });

  it('does not split Finnish abbreviations', () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Ostan maitoa, leipää yms. ja kahvia.', true)]);

    assert.deepEqual(h.emitted, ['Ostan maitoa, leipää yms. ja kahvia.']);
  });
});

describe('SpeechEngine lifecycle', () => {
  it('restarts after the browser ends recognition, keeping the same locale', () => {
    const h = harness('en-US');
    h.engine.start();
    const rec = h.rec();

    rec.stop(); // the browser ends the session on its own after a pause
    assert.equal(rec.started, false);
    tick(300);

    assert.equal(rec.started, true, 'recognising resumes after the restart delay');
    assert.equal(rec.lang, 'en-US', 'the locale survives a restart');
    assert.equal(instances.length, 1, 'a restart reuses the instance instead of rebuilding it');
  });

  it('retunes to a new locale by replacing the recogniser', () => {
    const h = harness('fi-FI');
    h.engine.start();
    const first = h.rec();

    h.engine.switchLocale('en-US');
    assert.equal(h.engine.currentLocale, 'en-US');

    tick(200);
    assert.equal(instances.length, 2);
    assert.equal(h.rec().lang, 'en-US');
    assert.ok(!first.started, 'the old instance must be released');
  });

  it('flushes pending text to the old language before switching', () => {
    const h = harness('fi-FI');
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Minulla on asiaa', true)]);
    h.engine.switchLocale('en-US');

    assert.deepEqual(h.emitted, ['Minulla on asiaa']);
  });

  it('reports a fatal failure when the browser has no speech API', () => {
    (globalThis as { window?: unknown }).window = {
      setTimeout: fakeSetTimeout,
      clearTimeout: fakeClearTimeout,
    };
    const h = harness();
    h.engine.start();

    assert.equal(h.failures.length, 1);
    assert.equal(h.failures[0].code, 'unsupported');
    assert.equal(h.failures[0].fatal, true);
  });

  it('stops sending interim text once stopped', async () => {
    const h = harness();
    h.engine.start();
    const rec = h.rec();

    fire(rec, [utter('Moi', false)]);
    await h.engine.stop();

    assert.equal(h.interim.at(-1), '');
    assert.equal(h.engine.isListening, false);
  });
});
