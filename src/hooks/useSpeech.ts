import { useCallback, useEffect, useRef, useState } from 'react';
import { checkSpeechSupport, type SpeechSupport } from '../lib/speech';
import { BilingualListener } from '../lib/listener';
import { localWhisperSupported, type WhisperModel } from '../lib/localWhisper';
import { LANG_NAME, type Direction, type Lang, type MicState, type RecorderState } from '../types';

type LocalePref = 'auto' | 'fi-FI' | 'en-US' | 'en-GB';

/** What the local model is doing, for the recorder bar. */
export interface ModelProgress {
  status: 'loading' | 'ready' | 'error';
  percent: number;
  detail: string;
}

interface Args {
  /** Language to start listening in. Auto mode moves on from here. */
  startLang: Lang;
  /** Session direction: `auto` detects, the others pin one language. */
  direction: Direction;
  localePref: LocalePref;
  /** Which recogniser to run. */
  engine: 'browser' | 'local';
  /** Whisper size, when `engine` is `local`. */
  model: WhisperModel;
  onSentence: (text: string, lang: Lang, detected: boolean) => void;
  onInterim: (text: string, lang: Lang) => void;
  onLanguageChange: (lang: Lang) => void;
  onNotice: (title: string, detail: string, tone: 'info' | 'warning' | 'error') => void;
  setRecorder: (state: RecorderState) => void;
  setMic: (state: MicState) => void;
  setStartedAt: (ts: number | null) => void;
}

function pinnedLangOf(direction: Direction): Lang | null {
  if (direction === 'fi-en') return 'fi';
  if (direction === 'en-fi') return 'en';
  return null;
}

/** Applies the English-variant preference; Finnish has only the one locale. */
export function localeFor(lang: Lang, pref: LocalePref): string {
  if (lang === 'fi') return 'fi-FI';
  return pref === 'en-GB' ? 'en-GB' : 'en-US';
}

/**
 * Drives the microphone.
 *
 * One recogniser is created per recording session and reused, so pressing Start
 * again mid-conversation is never necessary. The local engine needs no locale at
 * all — it decides the language from each finished sentence.
 */
export function useSpeech(args: Args) {
  const [support, setSupport] = useState<SpeechSupport>(() => checkSpeechSupport());
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
  const [micState, setMicState] = useState<MicState>('unknown');
  const listenerRef = useRef<BilingualListener | null>(null);
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    setSupport(checkSpeechSupport());
  }, []);

  useEffect(() => {
    return () => {
      listenerRef.current?.dispose();
      listenerRef.current = null;
    };
  }, []);

  // Keep a running listener in step with the direction switch.
  useEffect(() => {
    const listener = listenerRef.current;
    if (!listener) return;
    const pinned = pinnedLangOf(args.direction);
    listener.setMode(pinned === null, pinned ?? args.startLang);
  }, [args.direction, args.startLang]);

  const stop = useCallback(async () => {
    const listener = listenerRef.current;
    listenerRef.current = null;
    argsRef.current.onInterim('', argsRef.current.startLang);
    if (listener) await listener.stop();
    argsRef.current.setRecorder('idle');
    argsRef.current.setStartedAt(null);
  }, []);

  const start = useCallback(async () => {
    const { engine } = argsRef.current;

    if (engine === 'local') {
      if (!localWhisperSupported()) {
        argsRef.current.setRecorder('error');
        argsRef.current.onNotice(
          'On-device model unavailable',
          'This browser cannot run the local model. Switch the engine to “Browser” in settings, or type your sentences — they are saved and translated the same way.',
          'error',
        );
        return;
      }
    } else {
      const check = checkSpeechSupport();
      setSupport(check);
      if (!check.supported) {
        argsRef.current.setRecorder('error');
        argsRef.current.setStartedAt(null);
        argsRef.current.onNotice(
          'Speech recognition is unavailable',
          `${check.reason ?? 'This browser does not support it.'} Type the sentence instead — it is translated and saved exactly the same way.`,
          'error',
        );
        return;
      }
    }

    // Ask for the microphone explicitly so a denial is an early, clear error
    // rather than a recogniser that silently never produces results. The local
    // engine opens the device itself a moment later, so probing here would grab a
    // stream and release it immediately — on Windows that races the release and
    // fails with NotReadableError. It reports the same friendly messages instead.
    if (engine === 'browser' && micState !== 'granted') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setMicState('granted');
        argsRef.current.setMic('granted');
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        const notFound = name === 'NotFoundError' || name === 'DevicesNotFoundError';
        setMicState(notFound ? 'unavailable' : 'denied');
        argsRef.current.setMic(notFound ? 'unavailable' : 'denied');
        argsRef.current.setRecorder('error');
        argsRef.current.onNotice(
          'Microphone unavailable',
          `${
            notFound
              ? 'No microphone was found on this device.'
              : name === 'NotReadableError'
                ? 'The microphone is being used by another application.'
                : 'Microphone permission was denied.'
          } Allow microphone access for this site in your browser settings, or type your sentence below — manual input works without a microphone.`,
          'error',
        );
        return;
      }
    }

    argsRef.current.setRecorder('starting');

    const { startLang, direction, model } = argsRef.current;
    const pinned = pinnedLangOf(direction);
    setModelProgress(engine === 'local' ? { status: 'loading', percent: 0, detail: 'Starting…' } : null);

    const listener = new BilingualListener(
      pinned ?? startLang,
      {
        onSentence: (text, lang, detected) => argsRef.current.onSentence(text, lang, detected),
        onInterim: (text, lang) => argsRef.current.onInterim(text, lang),
        onListeningChange: (listening) => {
          argsRef.current.setRecorder(listening ? 'listening' : 'processing');
          if (listening) argsRef.current.setStartedAt(Date.now());
        },
        onFailure: (failure) => {
          if (failure.code === 'not-allowed') {
            setMicState('denied');
            argsRef.current.setMic('denied');
          } else if (failure.code === 'audio-capture') {
            setMicState('unavailable');
            argsRef.current.setMic('unavailable');
          }
          if (failure.fatal) {
            argsRef.current.setRecorder('error');
            argsRef.current.setStartedAt(null);
            argsRef.current.onInterim('', argsRef.current.startLang);
            argsRef.current.onNotice('Recognition stopped', failure.message, 'error');
          } else if (failure.code !== 'no-speech' && failure.code !== 'aborted') {
            argsRef.current.onNotice('Recognition interrupted', failure.message, 'warning');
          }
        },
        onLanguageChange: (lang) => {
          argsRef.current.onLanguageChange(lang);
          // In local mode the language is decided per sentence with no restart, so
          // there is nothing for the user to react to.
          if (argsRef.current.engine !== 'local') {
            argsRef.current.onNotice(
              'Listening language changed',
              `Now listening in ${LANG_NAME[lang]}. Keep talking — or check the notebook if a line sounded wrong.`,
              'info',
            );
          }
        },
        onProgress: (progress) => setModelProgress(progress),
      },
      pinned === null,
      (lang) => localeFor(lang, argsRef.current.localePref),
      { engine, model },
    );

    listenerRef.current = listener;
    await listener.start();
  }, [micState]);

  /** Tell a running listener that the user picked a different starting language. */
  const setStartLang = useCallback((lang: Lang) => {
    listenerRef.current?.setMode(true, lang);
  }, []);

  return { support, micState, modelProgress, start, stop, setStartLang };
}
