import type { Lang } from '../types';

/**
 * Finnish ↔ English language detection.
 *
 * The Web Speech API binds one locale per recogniser and has no auto-detect, so
 * the app answers the question from the transcript itself. Finnish and English
 * are easy to tell apart once you look at the right evidence: ä/ö and doubled
 * vowels versus th/qu/contractions, and two function-word sets that barely
 * overlap. Everything here is pure so the behaviour is unit-tested.
 */

const FI_WORDS = new Set(
  `ja on ei et että se sen sitä siitä siihen hän hänen häntä minä mun minun minua minulle
   sinä sun sinun sinua sinulle me meidän meitä te teidän he heidän heitä tämä tää tuo
   nämä ne niin kuin kun jos mutta tai sekä myös vain jo vielä nyt sitten tänään huomenna
   eilen tässä tuossa siellä täällä missä mihin mistä mitä miten miksi kuka mikä milloin
   paljon vähän hyvä hyvää huono iso pieni uusi vanha kaunis tärkeä koulu kouluun koulussa
   koti kotona kotiin työ töissä vesi ruoka kahvi aika päivä yö aamu ilta viikko kuukausi
   vuosi kello kiitos anteeksi hei moi moikka terve heippa kyllä joo juu emme ette eivät
   olen olet olemme olette ovat olin oli olisi olla ollut ole menen menee menossa mennä
   tulen tulee tulla teen tekee tehdä sanon sanoo sanoa puhun puhuu puhua tiedän tietää
   haluan haluaa haluat voin voi voida täytyy pitää osaan osaa ymmärrän ymmärrä ymmärtää
   kuuluu kuulostaa näyttää rakastan pidän asun asuu opiskelen opiskelee syön juon nukun
   ajan kävelen luin luen kirja ystävä ystävät perhe äiti isä sisko veli lapsi lapset tyttö
   poika koira kissa talo auto kaupunki kylä maa suomi suomea englanti englantia ruotsi
   kieli sana lause puhelin tietokone netti sää sataa paistaa kylmä kuuma lämmin väsynyt
   nälkä jano sairas onnellinen surullinen iloinen vihainen nopea hidas helppo vaikea sama
   eri toinen ensimmäinen viimeinen seuraava kaikki jotain mitään koska vaikka joten
   kuitenkin ehkä tietysti aina usein joskus harvoin koskaan melkein noin yli alle kanssa
   ilman jälkeen ennen luona päällä alla yllä välissä keskellä vasen oikea ylös alas pois
   mukaan mielestä mielestäni pitääkö onko eikö voisitko nähdään moro selvä okei jep`
    .split(/\s+/)
    .filter(Boolean),
);

const EN_WORDS = new Set(
  `the a an is are am was were be been have has had do does did will would shall should can
   could may might must and but or so if because although while when where what who whom
   whose which why how i you he she it we they me him her us them my your his its our their
   this that these those there here not no yes yeah nope very more most much many some any
   all both each every other another same different first last next one two three four five
   six seven eight nine ten today tomorrow yesterday now then soon later always often
   sometimes never again still already just only also too well good bad big small new old
   beautiful important school home house work job water food coffee tea beer milk time day
   night morning evening week month year hour minute clock thanks thank please sorry hello
   hi hey bye goodbye okay ok fine great nice happy sad tired hungry thirsty sick healthy
   fast slow easy hard difficult love like want need know think go going went come coming
   came get got make made take took see saw say said tell told speak spoke talk talked
   listen heard hear eat ate drink drank sleep slept walk walked run ran read write wrote
   book friend friends family mother father sister brother child children boy girl dog cat
   car city country weather rain raining hot cold warm phone computer internet language
   word sentence finnish english sweden finland exam examination meeting starts start let
   lets gonna wanna dont doesnt didnt cant cannot wont isnt arent wasnt couldnt shouldnt
   wouldnt thats theres heres im ive ill youre youve theyre were weve its kind sort really
   quite rather pretty little bit lot stuff thing things something anything nothing
   everyone someone people person speakers speak talking listening heard great`
    .split(/\s+/)
    .filter(Boolean),
);

/** Finnish inflectional endings — spoken Finnish is full of them. */
const FI_SUFFIXES: [RegExp, number][] = [
  [/(?:minen)$/, 1.5],
  [/(?:mista|mistä|missa|missä)$/, 1.2],
  [/(?:ssa|ssä)$/, 1.2],
  [/(?:sta|stä)$/, 1.2],
  [/(?:lla|llä)$/, 1.2],
  [/(?:lta|ltä)$/, 1.0],
  [/(?:lle)$/, 1.0],
  [/(?:ksi)$/, 0.9],
  [/(?:kko|kkö)$/, 1.0],
  [/(?:nen)$/, 1.2],
  [/(?:vat|vät)$/, 1.0],
  [/(?:mme|nne)$/, 0.9],
  [/(?:jen|ien)$/, 0.7],
  [/(?:tse)$/, 0.8],
  [/(?:kin)$/, 0.6],
];

const EN_SUFFIXES: [RegExp, number][] = [
  [/(?:tion|sion)$/, 1.3],
  [/(?:ment)$/, 1.1],
  [/(?:ness)$/, 1.0],
  [/(?:ous)$/, 0.9],
  [/(?:ive)$/, 0.8],
  [/(?:ing)$/, 0.9],
  [/(?:ly)$/, 0.6],
  [/(?:ed)$/, 0.4],
];

const EN_DIGRAPHS = /th|wh|sh|ch|gh|ph|ck|qu/g;
const EN_CONTRACTIONS = /n't|'s|'re|'ll|'ve|'d|'m/g;
const FI_LETTERS = /[äö]/g;
const FI_DOUBLE_UMLAUT = /[äöy]{2}/g;
const FI_DOUBLE_VOWEL = /[aeiou]{2}/g;
const EN_RARE_LETTERS = /[zqxw]/g;
const EN_INITIAL_CLUSTER =
  /^(?:bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|sc|sk|sl|sm|sn|sp|st|sw|tr|tw|th|wh|sh|ch|ph|kn|wr|gn|str|spr|scr|thr)/;

function count(haystack: string, re: RegExp): number {
  const found = haystack.match(re);
  return found ? found.length : 0;
}

export function tokenize(text: string): string[] {
  const matches = text.toLocaleLowerCase('fi-FI').match(/[\p{L}\p{M}']+/gu);
  if (!matches) return [];
  return matches.filter((token) => /\p{L}/u.test(token));
}

function scoreToken(token: string): { fi: number; en: number } {
  let fi = 0;
  let en = 0;

  if (FI_WORDS.has(token)) fi += 3;
  if (EN_WORDS.has(token)) en += 3;

  fi += count(token, FI_LETTERS) * 1.6;
  en += count(token, EN_RARE_LETTERS) * 0.6;

  fi += count(token, FI_DOUBLE_UMLAUT) * 1.0;
  fi += count(token, FI_DOUBLE_VOWEL) * 0.2;

  en += count(token, EN_DIGRAPHS) * 0.7;
  en += count(token, EN_CONTRACTIONS) * 1.6;
  if (EN_INITIAL_CLUSTER.test(token)) en += 0.5;

  for (const [re, weight] of FI_SUFFIXES) {
    if (re.test(token)) {
      fi += weight;
      break;
    }
  }
  for (const [re, weight] of EN_SUFFIXES) {
    if (re.test(token)) {
      en += weight;
      break;
    }
  }

  // A token with neither vowels nor 'y' is not a word in either language.
  if (!/[aeiouäöy]/.test(token)) {
    fi -= 0.4;
    en -= 0.4;
  }

  return { fi, en };
}

export interface LanguageVerdict {
  /** Best guess, or `null` when the text carries too little signal to say. */
  lang: Lang | null;
  /** 0–1. How decisively the winner leads, adjusted for how much text there was. */
  confidence: number;
  /** Raw evidence per language; roughly points, not a probability. */
  scores: Record<Lang, number>;
  /** How many word tokens were examined. */
  tokens: number;
}

/**
 * Which language is this text? Returns `lang: null` when there is not enough
 * evidence — callers should then keep whatever language they already had.
 */
export function detectLanguage(text: string): LanguageVerdict {
  const tokens = tokenize(text);
  const scores: Record<Lang, number> = { fi: 0, en: 0 };
  let letters = 0;

  for (const token of tokens) {
    letters += token.length;
    const s = scoreToken(token);
    scores.fi += s.fi;
    scores.en += s.en;
  }

  const total = scores.fi + scores.en;

  // Too little to go on: "mm", "ok", "ja", a cough.
  if (tokens.length === 0 || letters < 3 || total < 1.2) {
    return { lang: null, confidence: 0, scores, tokens: tokens.length };
  }

  const hi = Math.max(scores.fi, scores.en);
  const lo = Math.min(scores.fi, scores.en);
  const lang: Lang = scores.fi >= scores.en ? 'fi' : 'en';

  // Margin alone over-trusts one-word utterances, so scale by how much text there is.
  const margin = (hi - lo) / Math.max(1, Math.abs(hi) + Math.abs(lo));
  const lengthFactor = Math.min(1, tokens.length / 3);
  const confidence = Math.max(0, Math.min(1, margin * (0.5 + 0.5 * lengthFactor)));

  return { lang, confidence, scores, tokens: tokens.length };
}

/** Evidence per token for `lang`. Below ~0.3 the text barely resembles that language. */
export function plausibility(verdict: LanguageVerdict, lang: Lang): number {
  if (verdict.tokens === 0) return 0;
  return verdict.scores[lang] / verdict.tokens;
}

/** A switch needs the text to actually look like the language it is switching to. */
const MIN_SWITCH_EVIDENCE = 0.3;

/**
 * How sure detection must be before the live recogniser is retuned.
 *
 * Replacing the recogniser throws away the words in progress, so interim text has
 * to be convincing. A finished sentence is complete — there is nothing to lose —
 * so it only needs a clear winner.
 */
const SWITCH_CONFIDENCE = { interim: 0.72, final: 0.45 } as const;

export type ListenPhase = 'interim' | 'final';

export interface ListenDecision {
  /**
   * Best attribution of this text, and therefore the language to translate from.
   * This is the detected language whenever detection has any opinion — even when
   * the recogniser is not being retuned — because getting the *pair* right matters
   * more than keeping the engine in one locale.
   */
  lang: Lang;
  /** True when the recogniser should be restarted with `lang`. */
  switchNow: boolean;
  verdict: LanguageVerdict;
}

/**
 * Decides which language a transcript belongs to and whether the recogniser should
 * be retuned to match.
 *
 * The two questions are deliberately separate. Attribution always follows the
 * evidence, so a sentence is never translated from the wrong language just because
 * the switching threshold was not met. Retuning is the cautious part, because it
 * interrupts recognition.
 */
export function decideListenLanguage(
  active: Lang,
  text: string,
  phase: ListenPhase,
): ListenDecision {
  const verdict = detectLanguage(text);

  // No opinion: "mm", "ok", a cough. Keep listening as we were.
  if (verdict.lang === null) {
    return { lang: active, switchNow: false, verdict };
  }

  const lang = verdict.lang;
  if (lang === active) {
    return { lang, switchNow: false, verdict };
  }

  const switchNow =
    verdict.confidence >= SWITCH_CONFIDENCE[phase] && plausibility(verdict, lang) >= MIN_SWITCH_EVIDENCE;

  return { lang, switchNow, verdict };
}

/** True when the text is long enough to be worth a detection call at all. */
export function worthDetecting(text: string): boolean {
  return tokenize(text).length >= 1 && text.trim().length >= 3;
}
