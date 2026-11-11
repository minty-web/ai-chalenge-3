import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideListenLanguage,
  detectLanguage,
  plausibility,
  tokenize,
  worthDetecting,
} from './langDetect';

describe('detectLanguage', () => {
  it('recognises everyday Finnish', () => {
    const cases = [
      'Hei, mitä kuuluu?',
      'Minulla on huomenna tärkeä koe.',
      'Opiskelen suomea nyt kolmatta kuukautta.',
      'Se kuulostaa tosi hienolta!',
      'Kiitos, yritän puhua joka päivä.',
      'Tänään on kaunis päivä.',
      'Haluaisin yhden kahvin, kiitos.',
    ];
    for (const text of cases) {
      const verdict = detectLanguage(text);
      assert.equal(verdict.lang, 'fi', `expected Finnish for ${JSON.stringify(text)}`);
      assert.ok(verdict.confidence > 0.2, `low confidence for ${JSON.stringify(text)}`);
    }
  });

  it('recognises everyday English', () => {
    const cases = [
      'Hey, how are you?',
      'I have an important exam tomorrow.',
      "I've been studying Finnish for three months now.",
      'That sounds really great!',
      'Thanks, I try to speak every day.',
      'Today is a beautiful day.',
      'I would like one coffee, please.',
      "That's what I'm talking about.",
    ];
    for (const text of cases) {
      const verdict = detectLanguage(text);
      assert.equal(verdict.lang, 'en', `expected English for ${JSON.stringify(text)}`);
      assert.ok(verdict.confidence > 0.2, `low confidence for ${JSON.stringify(text)}`);
    }
  });

  it('returns null when there is too little to judge', () => {
    for (const text of ['', '   ', 'ok', 'mm', 'ja', '?...']) {
      assert.equal(detectLanguage(text).lang, null, `expected null for ${JSON.stringify(text)}`);
    }
  });

  it('is not fooled by shared words', () => {
    // "auto" and "kissa" exist in both vocabulary sets but the surrounding words decide.
    assert.equal(detectLanguage('Minä ajan autolla kotiin.').lang, 'fi');
    assert.equal(detectLanguage('I drive the car home.').lang, 'en');
  });

  it('handles a mixed sentence by majority evidence', () => {
    assert.equal(detectLanguage('Hei, how are you doing today my friend?').lang, 'en');
  });

  it('reports token counts and both scores', () => {
    const verdict = detectLanguage('Minulla on koe huomenna.');
    assert.equal(verdict.tokens, 4);
    assert.ok(verdict.scores.fi > verdict.scores.en);
  });
});

describe('tokenize', () => {
  it('keeps Finnish letters and contractions', () => {
    assert.deepEqual(tokenize("Minä en n't tiedä"), ['minä', 'en', "n't", 'tiedä']);
  });

  it('drops pure punctuation', () => {
    assert.deepEqual(tokenize('Hei! ... mitä?'), ['hei', 'mitä']);
  });
});

describe('plausibility', () => {
  it('is high for text in the right language and low otherwise', () => {
    const fi = detectLanguage('Minulla on tärkeä koe huomenna.');
    assert.ok(plausibility(fi, 'fi') > plausibility(fi, 'en'));

    const en = detectLanguage('I have an important exam tomorrow.');
    assert.ok(plausibility(en, 'en') > plausibility(en, 'fi'));
  });
});

describe('worthDetecting', () => {
  it('requires at least one real word', () => {
    assert.equal(worthDetecting(''), false);
    assert.equal(worthDetecting('!'), false);
    assert.equal(worthDetecting('hei'), true);
  });
});

describe('decideListenLanguage', () => {
  it('keeps listening in Finnish for a clear Finnish sentence', () => {
    const d = decideListenLanguage('fi', 'Minulla on huomenna tärkeä koe.', 'final');
    assert.equal(d.lang, 'fi');
    assert.equal(d.switchNow, false);
  });

  it('switches to English when a finished sentence is clearly English', () => {
    const d = decideListenLanguage('fi', 'I have an important exam tomorrow morning.', 'final');
    assert.equal(d.lang, 'en');
    assert.equal(d.switchNow, true);
  });

  it('is more cautious on interim text than on final text', () => {
    // One word: a clear English reading, but not worth interrupting a live session.
    const interim = decideListenLanguage('fi', 'morning', 'interim');
    const final = decideListenLanguage('fi', 'morning', 'final');
    // The finished sentence is worth a retune; the fragment is not.
    assert.equal(final.switchNow, true);
    assert.equal(interim.switchNow, false);
    // Either way the attribution is right, so nothing is translated the wrong way.
    assert.equal(interim.lang, 'en');
    assert.equal(final.lang, 'en');
  });

  it('attributes text correctly even when it does not switch the recogniser', () => {
    // Under the interim threshold, over the final one.
    const interim = decideListenLanguage('fi', 'coffee', 'interim');
    assert.equal(interim.lang, 'en');
    assert.equal(interim.switchNow, false);

    const final = decideListenLanguage('fi', 'coffee', 'final');
    assert.equal(final.lang, 'en');
    assert.equal(final.switchNow, true);
  });

  it('does not switch on a single ambiguous word', () => {
    const d = decideListenLanguage('fi', 'ja', 'final');
    assert.equal(d.switchNow, false);
    assert.equal(d.lang, 'fi');
  });

  it('switches back to Finnish after speaking English', () => {
    const d = decideListenLanguage('en', 'Huomenna minulla on tärkeä koe.', 'final');
    assert.equal(d.lang, 'fi');
    assert.equal(d.switchNow, true);
  });

  it('never switches on text with no signal', () => {
    for (const text of ['', 'ok', '?!']) {
      const d = decideListenLanguage('en', text, 'final');
      assert.equal(d.switchNow, false);
      assert.equal(d.lang, 'en');
    }
  });

  it('reports the verdict so callers can log how sure it was', () => {
    const d = decideListenLanguage('fi', 'Tomorrow I have an important exam.', 'final');
    assert.ok(d.verdict.confidence > 0.3);
    assert.equal(d.verdict.tokens, 6);
  });
});
