import assert from 'node:assert/strict';
import test from 'node:test';
import type { Entry, Session, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { buildExport, exportFilename, toMarkdown, toPlainText, type ExportOptions } from './export';

const session: Session = {
  id: 's1',
  title: 'Keskustelu kahvilassa',
  direction: 'fi-en',
  createdAt: new Date('2026-03-04T09:07:05').getTime(),
  updatedAt: new Date('2026-03-04T09:30:00').getTime(),
};

function entry(partial: Partial<Entry>): Entry {
  return {
    id: 'e1',
    sessionId: 's1',
    sourceText: 'Hei.',
    translation: 'Hi.',
    sourceLang: 'fi',
    targetLang: 'en',
    status: 'done',
    error: null,
    provider: 'google',
    fallback: false,
    origin: 'speech',
    createdAt: new Date('2026-03-04T09:07:30').getTime(),
    ...partial,
  };
}

const allOn: ExportOptions = { includeTranslation: true, includeTimestamps: true, includeProvider: true };

test('markdown export carries the session header fields', () => {
  const md = toMarkdown(session, [entry({})], allOn);
  assert.match(md, /^# ChatterSnap Conversation/);
  assert.match(md, /\*\*Session:\*\* Keskustelu kahvilassa/);
  assert.match(md, /\*\*Direction:\*\* Finnish → English/);
  assert.match(md, /\*\*Entries:\*\* 1/);
});

test('markdown export labels the source and target language', () => {
  const md = toMarkdown(session, [entry({})], allOn);
  assert.match(md, /\*\*Finnish:\*\*\n\nHei\./);
  assert.match(md, /\*\*English:\*\*\n\nHi\./);
});

test('markdown keeps per-entry timestamps when asked', () => {
  const md = toMarkdown(session, [entry({})], allOn);
  assert.match(md, /### \[09:07:30\]/);
});

test('markdown drops timestamps and translations when the prefs say so', () => {
  const md = toMarkdown(session, [entry({})], {
    includeTranslation: false,
    includeTimestamps: false,
    includeProvider: false,
  });
  assert.doesNotMatch(md, /09:07:30/);
  assert.doesNotMatch(md, /Hi\./);
  assert.doesNotMatch(md, /translated with/);
});

test('a failed translation is exported as a readable note, not as null', () => {
  const md = toMarkdown(
    session,
    [entry({ translation: null, status: 'error', error: 'network down', provider: null })],
    allOn,
  );
  assert.match(md, /_\(translation failed: network down\)_/);
  assert.doesNotMatch(md, /null/);
});

test('entries are ordered by createdAt even when passed unsorted', () => {
  const first = entry({ id: 'a', sourceText: 'Ensin.', translation: 'First.', createdAt: 200 });
  const second = entry({ id: 'b', sourceText: 'Sitten.', translation: 'Then.', createdAt: 100 });
  const md = toMarkdown(session, [first, second], allOn);
  assert.ok(md.indexOf('Then.') < md.indexOf('First.'), 'earlier entry should come first');
});

test('an empty session exports a clear placeholder', () => {
  const md = toMarkdown(session, [], allOn);
  assert.match(md, /_No entries in this session\._/);
  const txt = toPlainText(session, [], allOn);
  assert.match(txt, /\(No entries in this session\.\)/);
});

test('plain text export uses FI/EN labels and a timestamp line', () => {
  const txt = toPlainText(session, [entry({})], allOn);
  assert.match(txt, /^ChatterSnap Conversation/);
  assert.match(txt, /\[09:07:30\]/);
  assert.match(txt, /FI:\nHei\./);
  assert.match(txt, /EN:\nHi\./);
});

test('filename is slugged, stamped and uses the right extension', () => {
  const md = exportFilename(session, 'md');
  assert.match(md, /^chattersnap-keskustelu-kahvilassa-\d{8}-\d{4}\.md$/);
  assert.match(exportFilename(session, 'txt'), /\.txt$/);
});

test('filename falls back to a safe stem when the title has no usable characters', () => {
  const name = exportFilename({ ...session, title: '///' }, 'md');
  assert.match(name, /^chattersnap-chattersnap-/);
});

test('buildExport honours the settings format and reports a matching mime type', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, exportFormat: 'txt' };
  const built = buildExport(session, [entry({})], settings);
  assert.match(built.filename, /\.txt$/);
  assert.equal(built.mime, 'text/plain;charset=utf-8');
  assert.match(built.content, /ChatterSnap Conversation/);
});

test('buildExport accepts an explicit format override', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, exportFormat: 'txt' };
  const built = buildExport(session, [entry({})], settings, 'md');
  assert.match(built.filename, /\.md$/);
  assert.equal(built.mime, 'text/markdown;charset=utf-8');
});
