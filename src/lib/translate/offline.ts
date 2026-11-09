import type { Lang } from '../../types';

/**
 * Last-resort translation used only when every real provider is unreachable.
 * It is a hand-built phrase/word transformer, deliberately labelled as offline in the UI.
 * It is never presented as a real machine translation.
 */

type Pair = Record<Lang, string>;

const PHRASES: Pair[] = [
  { fi: 'hei', en: 'hi' },
  { fi: 'moi', en: 'hi' },
  { fi: 'terve', en: 'hello' },
  { fi: 'hyvää huomenta', en: 'good morning' },
  { fi: 'hyvää iltaa', en: 'good evening' },
  { fi: 'hyvää yötä', en: 'good night' },
  { fi: 'mitä kuuluu', en: 'how are you' },
  { fi: 'kiitos', en: 'thank you' },
  { fi: 'kiitos paljon', en: 'thank you very much' },
  { fi: 'ole hyvä', en: 'you are welcome' },
  { fi: 'anteeksi', en: 'sorry' },
  { fi: 'näkemiin', en: 'goodbye' },
  { fi: 'kyllä', en: 'yes' },
  { fi: 'ei', en: 'no' },
  { fi: 'ehkä', en: 'maybe' },
  { fi: 'tänään', en: 'today' },
  { fi: 'huomenna', en: 'tomorrow' },
  { fi: 'eilen', en: 'yesterday' },
  { fi: 'nyt', en: 'now' },
  { fi: 'myöhemmin', en: 'later' },
  { fi: 'koulu', en: 'school' },
  { fi: 'kouluun', en: 'to school' },
  { fi: 'työ', en: 'work' },
  { fi: 'kaupassa', en: 'at the shop' },
  { fi: 'tärkeä koe', en: 'important examination' },
  { fi: 'tärkeä', en: 'important' },
  { fi: 'koe', en: 'examination' },
  { fi: 'minulla on', en: 'i have' },
  { fi: 'sinulla on', en: 'you have' },
  { fi: 'meillä on', en: 'we have' },
  { fi: 'minä olen', en: 'i am' },
  { fi: 'minä menen', en: 'i am going' },
  { fi: 'olen menossa', en: 'i am going' },
  { fi: 'haluan', en: 'i want' },
  { fi: 'tarvitsen', en: 'i need' },
  { fi: 'en ymmärrä', en: "i don't understand" },
  { fi: 'ymmärrän', en: 'i understand' },
  { fi: 'puhutko englantia', en: 'do you speak english' },
  { fi: 'puhun suomea', en: 'i speak finnish' },
  { fi: 'missä on', en: 'where is' },
  { fi: 'paljonko tämä maksaa', en: 'how much does this cost' },
  { fi: 'vettä', en: 'water' },
  { fi: 'kahvi', en: 'coffee' },
  { fi: 'ruoka', en: 'food' },
  { fi: 'ystävä', en: 'friend' },
  { fi: 'perhe', en: 'family' },
  { fi: 'ja', en: 'and' },
  { fi: 'mutta', en: 'but' },
  { fi: 'koska', en: 'because' },
  { fi: 'jos', en: 'if' },
  { fi: 'että', en: 'that' },
  { fi: 'on', en: 'is' },
  { fi: 'ovat', en: 'are' },
  { fi: 'minä', en: 'i' },
  { fi: 'sinä', en: 'you' },
  { fi: 'hän', en: 'he' },
  { fi: 'me', en: 'we' },
  { fi: 'he', en: 'they' },
  { fi: 'se', en: 'it' },
  { fi: 'tämä', en: 'this' },
  { fi: 'tuo', en: 'that' },
  { fi: 'hyvä', en: 'good' },
  { fi: 'huono', en: 'bad' },
  { fi: 'iso', en: 'big' },
  { fi: 'pieni', en: 'small' },
  { fi: 'uusi', en: 'new' },
  { fi: 'vanha', en: 'old' },
  { fi: 'kaunis', en: 'beautiful' },
  { fi: 'nopea', en: 'fast' },
  { fi: 'hidas', en: 'slow' },
  { fi: 'mennä', en: 'to go' },
  { fi: 'tulla', en: 'to come' },
  { fi: 'tehdä', en: 'to do' },
  { fi: 'nähdä', en: 'to see' },
  { fi: 'syödä', en: 'to eat' },
  { fi: 'juoda', en: 'to drink' },
  { fi: 'opiskella', en: 'to study' },
  { fi: 'asua', en: 'to live' },
  { fi: 'rakastaa', en: 'to love' },
];

const PHRASE_LOOKUP: Pair[] = [...PHRASES].sort((a, b) => b.fi.length - a.fi.length);

function lowerFirst(s: string): string {
  return s.length ? s[0].toLocaleLowerCase() + s.slice(1) : s;
}

function upperFirst(s: string): string {
  return s.length ? s[0].toLocaleUpperCase() + s.slice(1) : s;
}

function translateSentence(sentence: string, from: Lang): string {
  const to: Lang = from === 'fi' ? 'en' : 'fi';
  const leading = sentence.match(/^[\s"'«„(]*/)?.[0] ?? '';
  const trailing = sentence.match(/[\s"'»“).!?,;:]*$/)?.[0] ?? '';
  const core = sentence.slice(leading.length, sentence.length - trailing.length);
  if (!core) return sentence;

  let working = ` ${core.toLocaleLowerCase('fi-FI')} `;
  let touched = false;

  for (const pair of PHRASE_LOOKUP) {
    const needle = ` ${pair[from]} `;
    if (working.includes(needle)) {
      working = working.split(needle).join(` ${pair[to]} `);
      touched = true;
    }
  }

  let out = working.replace(/\s+/g, ' ').trim();
  if (!touched) {
    // Nothing matched: keep the original rather than invent a translation.
    return sentence;
  }
  out = upperFirst(out);
  const endsWithPunct = /[.!?…]$/.test(core);
  if (endsWithPunct) {
    const mark = core.trimEnd().slice(-1);
    out = `${out.replace(/[.,;:]+$/, '')}${mark}`;
  } else {
    out = `${out}.`;
  }
  return `${leading}${out}${trailing.startsWith(' ') ? '' : ''}`.trimEnd();
}

export interface OfflineResult {
  text: string;
  /** Fraction of sentences the phrasebook could actually handle. */
  coverage: number;
}

export function offlineTranslate(text: string, from: Lang): OfflineResult {
  const parts = text.split(/(?<=[.!?…])\s+/).filter((p) => p.trim().length > 0);
  if (parts.length === 0) return { text, coverage: 0 };
  let handled = 0;
  const out = parts.map((part) => {
    const translated = translateSentence(part, from);
    if (translated !== part) handled += 1;
    return translated;
  });
  return { text: out.join(' '), coverage: handled / parts.length };
}

/** Used by the UI to warn when the offline engine cannot help. */
export { lowerFirst };