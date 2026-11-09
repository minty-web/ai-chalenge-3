export type Lang = 'fi' | 'en';

/** `fi-en` means the source language is Finnish and the target is English. */
export type Direction = 'fi-en' | 'en-fi';

export const DIRECTIONS: Record<Direction, { source: Lang; target: Lang; label: string; flag: string }> = {
  'fi-en': { source: 'fi', target: 'en', label: 'Finnish → English', flag: '🇫🇮' },
  'en-fi': { source: 'en', target: 'fi', label: 'English → Finnish', flag: '🇬🇧' },
};

export function langsOf(direction: Direction): { source: Lang; target: Lang } {
  const d = DIRECTIONS[direction];
  return { source: d.source, target: d.target };
}

export function invertDirection(direction: Direction): Direction {
  return direction === 'fi-en' ? 'en-fi' : 'fi-en';
}

export const LANG_NAME: Record<Lang, string> = { fi: 'Finnish', en: 'English' };
export const LANG_CODE: Record<Lang, string> = { fi: 'FI', en: 'EN' };

/** BCP-47 tags used by the Web Speech API. */
export const SPEECH_LOCALE: Record<Lang, string> = { fi: 'fi-FI', en: 'en-US' };

export type TranslationStatus = 'pending' | 'done' | 'error' | 'off';

export type EntryOrigin = 'speech' | 'manual';

export interface Entry {
  id: string;
  sessionId: string;
  /** The sentence exactly as it was spoken or typed. Always preserved. */
  sourceText: string;
  /** `null` until a translation lands, or when translation is off/failed. */
  translation: string | null;
  /** Languages captured with the entry, so history stays readable after a direction change. */
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

export interface Settings {
  theme: ThemeMode;
  defaultDirection: Direction;
  /** `auto` follows the selected direction. */
  recognitionLang: 'auto' | 'fi-FI' | 'en-US' | 'en-GB';
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
  defaultDirection: 'fi-en',
  recognitionLang: 'auto',
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