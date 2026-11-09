import { useCallback, useEffect, useRef, useState } from 'react';
import { checkSpeechSupport, resolveLocale, type SpeechSupport } from '../lib/speech';
import { SpeechEngine } from '../lib/speechEngine';
import type { Lang, MicState, RecorderState } from '../types';

interface Args {
  lang: Lang;
  override: 'auto' | 'fi-FI' | 'en-US' | 'en-GB';
  onSentence: (sentence: string) => void;
  onInterim: (text: string) => void;
  onNotice: (title: string, detail: string, tone: 'info' | 'warning' | 'error') => void;
  setRecorder: (state: RecorderState) => void;
  setMic: (state: MicState) => void;
  setStartedAt: (ts: number | null) => void;
}

export function useSpeech(args: Args) {
  const [support, setSupport] = useState<SpeechSupport>(() => checkSpeechSupport());
  const [micState, setMicState] = useState<MicState>('unknown');
  const engineRef = useRef<SpeechEngine | null>(null);
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    setSupport(checkSpeechSupport());
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const stop = useCallback(async () => {
    const engine = engineRef.current;
    engineRef.current = null;
    argsRef.current.onInterim('');
    if (engine) await engine.stop();
    argsRef.current.setRecorder('idle');
    argsRef.current.setStartedAt(null);
  }, []);

  const start = useCallback(async () => {
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

    // Ask for the microphone explicitly so a denial is an early, clear error.
    if (micState !== 'granted') {
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

    const locale = resolveLocale(args.lang, args.override);
    const engine = new SpeechEngine(locale, {
      onFinalSentence: (s) => argsRef.current.onSentence(s),
      onInterim: (t) => argsRef.current.onInterim(t),
      onListeningChange: (listening) => {
        argsRef.current.setRecorder(listening ? 'listening' : 'processing');
        if (listening) argsRef.current.setStartedAt(Date.now());
      },
      onFailure: (failure) => {
        if (failure.fatal) {
          argsRef.current.setRecorder('error');
          argsRef.current.setStartedAt(null);
          argsRef.current.onInterim('');
        }
        if (failure.fatal) {
          argsRef.current.onNotice('Recognition stopped', failure.message, 'error');
        } else if (failure.code !== 'no-speech' && failure.code !== 'aborted') {
          argsRef.current.onNotice('Recognition interrupted', failure.message, 'warning');
        }
      },
    });
    engineRef.current = engine;
    engine.start();
  }, [args.lang, args.override, micState]);

  const setLocale = useCallback((lang: Lang, override: Args['override']) => {
    engineRef.current?.setLocale(resolveLocale(lang, override));
  }, []);

  const isActive = useCallback(() => engineRef.current !== null, []);

  return { support, micState, start, stop, setLocale, isActive };
}