import type { Lang, MicState, RecorderState } from '../types';
import { SPEECH_LOCALE } from '../types';

/**
 * Sentence segmentation + duplicate suppression for the Web Speech API.
 *
 * The browser hands us a transcript stream: interim fragments while the user
 * speaks, then a final string. Chrome also restarts `onend` after a pause, so a
 * naive implementation duplicates sentences. Everything here is pure so it can
 * be unit-tested without a browser.
 */

const PROTECTED_ABBREVIATIONS = [
  'esim',
  'mm',
  'jne',
  'jne.',
  'klo',
  'nro',
  'ym',
  'yms',
  'vrt',
  'ts',
  'no',
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'st',
  'etc',
  'e.g',
  'i.e',
  'vs',
];

/** True when the string carries at least one letter or digit. */
export function hasSpeechContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** Lowercase, whitespace-collapsed, punctuation-stripped key for dedupe. */
export function speechDedupeKey(text: string): string {
  return text
    .toLocaleLowerCase('fi-FI')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.,!?;:…"«»„“”()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function protectAbbreviations(text: string): string {
  let out = text;
  for (const abbr of PROTECTED_ABBREVIATIONS) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[\\s"(])(${escaped})\\.`, 'gi');
    out = out.replace(re, (_m, pre: string, word: string) => `${pre}${word}\u0001`);
  }
  return out;
}

/**
 * Splits a finished transcript into sentences on `.` `!` `?` and `…`.
 * Finnish and English share the same terminators.
 */
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const guarded = protectAbbreviations(cleaned);
  const parts: string[] = [];
  let buffer = '';

  for (let i = 0; i < guarded.length; i += 1) {
    const ch = guarded[i];
    buffer += ch;
    if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      while (i + 1 < guarded.length && /[.!?…]/.test(guarded[i + 1])) {
        i += 1;
        buffer += guarded[i];
      }
      const rest = guarded.slice(i + 1);
      // A terminator ends a sentence only at the end or before whitespace.
      if (rest.length === 0 || /^\s/.test(rest)) {
        parts.push(buffer);
        buffer = '';
      }
    }
  }
  if (buffer.trim()) parts.push(buffer);

  return parts
    .map((p) => p.replace(/\u0001/g, '.').trim())
    .filter((p) => p.length > 0 && hasSpeechContent(p));
}

export interface SentenceSplitterState {
  /** Sentences already emitted; used to suppress repeats across restarts. */
  seen: string[];
}

/**
 * Stateful splitter: feed it final transcripts, get back only new sentences.
 * Guards against the same sentence arriving twice (browser restart, or the
 * engine re-emitting a longer version of an earlier final).
 */
export class SentenceSplitter {
  private seen = new Set<string>();

  constructor(known: string[] = []) {
    for (const s of known) this.seen.add(speechDedupeKey(s));
  }

  prime(known: string[]): void {
    for (const text of known) {
      for (const sentence of splitSentences(text)) this.seen.add(speechDedupeKey(sentence));
      const whole = text.trim();
      if (whole) this.seen.add(speechDedupeKey(whole));
    }
  }

  get size(): number {
    return this.seen.size;
  }

  /** Returns the brand-new sentences contained in this final transcript. */
  push(finalTranscript: string): string[] {
    const fresh: string[] = [];
    for (const sentence of splitSentences(finalTranscript)) {
      const key = speechDedupeKey(sentence);
      if (!key || key.length < 1) continue;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      fresh.push(sentence);
    }
    return fresh;
  }
}

export interface SpeechSupport {
  supported: boolean;
  secure: boolean;
  reason: string | null;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionErrorLike {
  error: string;
  message?: string;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

export function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSecureEnoughForSpeech(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    window.isSecureContext ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]'
  );
}

export function checkSpeechSupport(): SpeechSupport {
  const ctor = getRecognitionCtor();
  const secure = isSecureEnoughForSpeech();
  if (!ctor) {
    return {
      supported: false,
      secure,
      reason:
        'This browser has no Web Speech API. Chrome, Edge and Safari support it; in other browsers use the text box.',
    };
  }
  if (!secure) {
    return {
      supported: false,
      secure,
      reason:
        'The page must be served over HTTPS or localhost for the microphone to work. Use `npm run dev` and open localhost.',
    };
  }
  return { supported: true, secure, reason: null };
}

export function resolveLocale(lang: Lang, override: 'auto' | 'fi-FI' | 'en-US' | 'en-GB'): string {
  return override === 'auto' ? SPEECH_LOCALE[lang] : override;
}

export interface RecognitionFailure {
  code: string;
  message: string;
  fatal: boolean;
}

export function describeSpeechError(event: SpeechRecognitionErrorLike): RecognitionFailure {
  const code = event.error;
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        code,
        message:
          'Microphone permission was denied. Click the microphone icon in the address bar, allow access, then start recording again. You can type sentences meanwhile.',
        fatal: true,
      };
    case 'audio-capture':
      return {
        code,
        message:
          'No microphone was detected. Connect one and try again — or type your sentences below.',
        fatal: true,
      };
    case 'language-not-supported':
      return {
        code,
        message:
          'This browser does not support recognising the selected language. Switch the direction or install a language pack; manual input always works.',
        fatal: true,
      };
    case 'no-speech':
      return { code, message: 'No speech detected — still listening.', fatal: false };
    case 'aborted':
      return { code, message: 'Recognition stopped.', fatal: false };
    case 'network':
      return {
        code,
        message:
          'Recognition needs a network connection (the browser sends audio to its vendor). Check your connection and start again, or type your sentence.',
        fatal: false,
      };
    default:
      return {
        code,
        message: event.message?.trim()
          ? `Speech recognition error: ${event.message}`
          : `Speech recognition error (${code}). Recognition restarted — keep speaking or stop and start again.`,
        fatal: false,
      };
  }
}

export type { SpeechRecognitionEventLike };

/** Re-exported for convenience in components. */
export type SpeechState = { recorder: RecorderState; mic: MicState };