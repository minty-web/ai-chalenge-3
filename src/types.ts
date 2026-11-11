export type Lang = 'fi' | 'en';

export const LANGS: Lang[] = ['fi', 'en'];

/**
 * `auto` listens and transcribes whatever the speaker uses and translates each
 * sentence into the other language. The explicit directions pin the input
 * language when detection is not wanted.
 */
export type Direction = 'auto' | 'fi-en' | 'en-fi';

export interface DirectionInfo {
  /** `null` in auto mode: the language comes from each sentence. */
  source: Lang | null;
  target: Lang | null;
  label: string;
  short: string;
  flag: string;
  hint: string;
}

export const DIRECTIONS: Record<Direction, DirectionInfo> = {
  auto: {
    source: null,
    target: null,
    label: 'Finnish ↔ English',
    short: 'AUTO',
    flag: '🇫🇮',
    hint: 'Speak either language — each sentence is detected and translated automatically.',
  },
  'fi-en': {
    source: 'fi',
    target: 'en',
    label: 'Finnish → English',
    short: 'FI → EN',
    flag: '🇫🇮',
    hint: 'Everything you say is treated as Finnish and translated into English.',
  },
  'en-fi': {
    source: 'en',
    target: 'fi',
    label: 'English → Finnish',
    short: 'EN → FI',
    flag: '🇬🇧',
    hint: 'Everything you say is treated as English and translated into Finnish.',
  },
};

export const DIRECTION_ORDER: Direction[] = ['auto', 'fi-en', 'en-fi'];

export function langsOf(direction: Direction, fallback: Lang = 'fi'): { source: Lang; target: Lang } {
  const d = DIRECTIONS[direction];
  const source = d.source ?? fallback;
  return { source, target: d.target ?? otherLang(source) };
}

export function invertDirection(direction: Direction): Direction {
  if (direction === 'fi-en') return 'en-fi';
  if (direction === 'en-fi') return 'fi-en';
  return 'auto';
}

export function otherLang(lang: Lang): Lang {
  return lang === 'fi' ? 'en' : 'fi';
}

/** The language a sentence is translated *into*. */
export function targetFor(source: Lang, direction: Direction): Lang {
  return DIRECTIONS[direction].target ?? otherLang(source);
}

export const LANG_NAME: Record<Lang, string> = { fi: 'Finnish', en: 'English' };
export const LANG_CODE: Record<Lang, string> = { fi: 'FI', en: 'EN' };

/** BCP-47 tags used by the Web Speech API. */
export const SPEECH_LOCALE: Record<Lang, string> = { fi: 'fi-FI', en: 'en-US' };

export function localeToLang(locale: string): Lang {
  return locale.toLowerCase().startsWith('fi') ? 'fi' : 'en';
}

export type TranslationStatus = 'pending' | 'done' | 'error' | 'off';

export type EntryOrigin = 'speech' | 'manual';

export interface Entry {
  id: string;
  sessionId: string;
  /** The sentence exactly as it was spoken or typed. Always preserved. */
  sourceText: string;
  /** `null` until a translation lands, or when translation is off/failed. */
  translation: string | null;
  /** Languages captured with the entry, so history stays readable after a change. */
  sourceLang: Lang;
  targetLang: Lang;
  status: TranslationStatus;
  /** Human readable reason when `status === 'error'`. */
  error: string | null;
  /** Which translation engine produced `translation`. */
  provider: string | null;
  /** `true` when the translation came from the offline phrasebook. */
  fallback: boolean;
  origin: EntryOrigin;
  /** `true` when the source language was detected rather than pinned. */
  detected?: boolean;
  createdAt: number;
}

export interface Session {
  id: string;
  title: string;
  direction: Direction;
  createdAt: number;
  updatedAt: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type ProviderId = 'auto' | 'google' | 'mymemory' | 'libre' | 'offline';

/** Settings the user chooses once and the app remembers between visits. */
export interface Settings {
  theme: ThemeMode;
  /**
   * The one switch for listening behaviour: `auto` detects each sentence's
   * language and translates into the other, `fi-en`/`en-fi` pin the input language.
   */
  defaultDirection: Direction;
  /** Preferred variant of the English locale, for spelling and voice choice. */
  recognitionLang: 'auto' | 'fi-FI' | 'en-US' | 'en-GB';
  /**
   * Which recogniser runs.
   *
   * `browser` is Chrome's built-in Web Speech API: instant, no download, but it
   * streams audio to the vendor and hands back revised hypotheses. `local` runs
   * Whisper in the page — nothing leaves the device, and a sentence is
   * transcribed once instead of being re-revised.
   */
  asrEngine: 'browser' | 'local';
  /** Whisper size when `asrEngine` is `local`. */
  asrModel: 'tiny' | 'base';
  autoTranslate: boolean;
  autoScroll: boolean;
  provider: ProviderId;
  libreEndpoint: string;
  /** Ask the bundled proxy to attach a server-side API key (never sent from the browser). */
  useProxyCredentials: boolean;
  exportFormat: 'md' | 'txt';
  exportIncludeTranslation: boolean;
  exportIncludeTimestamps: boolean;
  showInterim: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultDirection: 'auto',
  recognitionLang: 'auto',
  asrEngine: 'browser',
  asrModel: 'base',
  autoTranslate: true,
  autoScroll: true,
  provider: 'auto',
  libreEndpoint: 'https://libretranslate.com/translate',
  useProxyCredentials: false,
  exportFormat: 'md',
  exportIncludeTranslation: true,
  exportIncludeTimestamps: true,
  showInterim: true,
};

export type RecorderState = 'idle' | 'starting' | 'listening' | 'processing' | 'error';

export type MicState = 'unknown' | 'granted' | 'denied' | 'unavailable';

export interface TranslateOutcome {
  text: string;
  provider: string;
  providerLabel: string;
  fallback: boolean;
}
