import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSentences, speechDedupeKey, hasSpeechContent, SentenceSplitter } from './speech';

test('splitSentences cuts on a terminator followed by whitespace', () => {
  assert.deepEqual(splitSentences('Hei siellä. Mitä kuuluu?'), ['Hei siellä.', 'Mitä kuuluu?']);
});

test('splitSentences keeps a trailing fragment without a terminator', () => {
  assert.deepEqual(splitSentences('Hello there. I am still talking'), [
    'Hello there.',
    'I am still talking',
  ]);
});

test('splitSentences does not split a decimal number', () => {
  assert.deepEqual(splitSentences('The meeting is at 9.30 tomorrow.'), [
    'The meeting is at 9.30 tomorrow.',
  ]);
});

test('splitSentences protects Finnish abbreviations', () => {
  const cases = ['Se on esim. tärkeä.', 'Tulen klo. 15 jälkeen.', 'Ota vettä, maito jne. mukaan.'];
  for (const input of cases) {
    assert.equal(splitSentences(input).length, 1, `should stay one sentence: ${input}`);
  }
});

test('splitSentences absorbs repeated terminators', () => {
  assert.deepEqual(splitSentences('Really?! Yes.'), ['Really?!', 'Yes.']);
});

test('splitSentences returns nothing useful for blank input', () => {
  assert.deepEqual(splitSentences('   '), []);
});

test('splitSentences handles multi-sentence Finnish speech', () => {
  const out = splitSentences('Huomenta. Tänään on kylmä. Mennäänkö kahville?');
  assert.deepEqual(out, ['Huomenta.', 'Tänään on kylmä.', 'Mennäänkö kahville?']);
});

test('speechDedupeKey ignores case and punctuation', () => {
  assert.equal(speechDedupeKey('Hello, there!'), speechDedupeKey('hello there'));
  assert.equal(speechDedupeKey('  Hei  '), 'hei');
  assert.notEqual(speechDedupeKey('hei'), speechDedupeKey('heippa'));
});

test('hasSpeechContent rejects punctuation-only noise', () => {
  assert.equal(hasSpeechContent('...'), false);
  assert.equal(hasSpeechContent('   '), false);
  assert.equal(hasSpeechContent('hei'), true);
});

test('SentenceSplitter emits only new sentences once primed', () => {
  const splitter = new SentenceSplitter();
  splitter.prime(['Hello there. How are you?']);
  assert.deepEqual(splitter.push('Hello there. How are you? Fine thanks.'), ['Fine thanks.']);
});

test('SentenceSplitter does not repeat an already emitted sentence', () => {
  const splitter = new SentenceSplitter();
  assert.deepEqual(splitter.push('Hei.'), ['Hei.']);
  assert.deepEqual(splitter.push('Hei.'), []);
  assert.deepEqual(splitter.push('Hei. Mitä kuuluu?'), ['Mitä kuuluu?']);
});
