import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Square, TriangleAlert, Check } from 'lucide-react';
import { useMicLevel } from '../hooks/useMicLevel';
import { checkSpeechSupport, describeSpeechError, getRecognitionCtor } from '../lib/speech';
import { localeFor } from '../hooks/useSpeech';
import { LANG_NAME, type Lang } from '../types';

type Probe = 'idle' | 'listening' | 'heard' | 'failed';

interface MicTestDialogProps {
  open: boolean;
  onClose: () => void;
  /** Which language the test sentence should be spoken in. */
  lang: Lang;
  localePref: 'auto' | 'fi-FI' | 'en-US' | 'en-GB';
}

const PROBE_MS = 8000;

/**
 * "Does my microphone actually work?"
 *
 * Access and recognition are two different failures — permission can be granted
 * while recognition is still unavailable (Firefox), and recognition can be
 * available while the wrong input device is selected and hears nothing. So the
 * test checks both, separately, and shows the live level so a silent microphone is
 * obvious rather than mysterious.
 */
export function MicTestDialog({ open, onClose, lang, localePref }: MicTestDialogProps) {
  const [support] = useState(() => checkSpeechSupport());
  const [probe, setProbe] = useState<Probe>('idle');
  const [transcript, setTranscript] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const timerRef = useRef<number | null>(null);

  const { level, error: levelError } = useMicLevel(open, open);

  const stopProbe = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setProbe((p) => (p === 'listening' ? 'idle' : p));
  }, []);

  // Never leave the recogniser or the audio graph running behind a closed dialog.
  useEffect(() => {
    if (open) return;
    stopProbe();
    setProbe('idle');
    setTranscript('');
    setFailure(null);
  }, [open, stopProbe]);

  useEffect(() => () => stopProbe(), [stopProbe]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const startProbe = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setProbe('failed');
      setFailure('This browser has no SpeechRecognition API, so speech cannot be recognised here.');
      return;
    }
    setTranscript('');
    setFailure(null);
    setProbe('listening');

    const rec = new Ctor();
    rec.lang = localeFor(lang, localePref);
    rec.continuous = true;
    rec.interimResults = true;

    let finalText = '';
    let heardAnything = false;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const chunk = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += `${chunk} `;
        else interim += chunk;
      }
      const combined = `${finalText}${interim}`.trim();
      if (combined) {
        heardAnything = true;
        setTranscript(combined);
        setProbe('heard');
      }
    };

    rec.onerror = (event) => {
      const described = describeSpeechError(event);
      if (described.code === 'no-speech' || described.code === 'aborted') return;
      if (described.fatal || described.code === 'network') {
        setProbe('failed');
        setFailure(described.message);
      }
    };

    rec.onend = () => {
      // Chrome ends the session on its own; for a test that is the finish line.
      if (!heardAnything) {
        setProbe((p) => (p === 'failed' ? p : heardAnything ? 'heard' : 'idle'));
      }
      recRef.current = null;
    };

    try {
      rec.start();
    } catch {
      setProbe('failed');
      setFailure('The recogniser refused to start. Try closing other apps that use the microphone.');
      return;
    }

    recRef.current = { stop: () => rec.stop() };
    timerRef.current = window.setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      recRef.current = null;
    }, PROBE_MS);
  };

  if (!open) return null;

  const heard = level > 0.04;
  const micOk = !levelError;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mic-test-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ln-surface w-full max-w-md p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="mic-test-title" className="text-[1rem] font-semibold">
              Test the microphone
            </h2>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed" style={{ color: 'var(--ln-muted)' }}>
              Speak {LANG_NAME[lang]} — the meter shows input, the box below shows what the recogniser hears.
            </p>
          </div>
          <button type="button" onClick={onClose} className="ln-btn ln-btn-ghost h-7 px-2 text-[0.75rem]">
            Close
          </button>
        </div>

        {/* 1. Device access + live level */}
        <Row
          label="Microphone access"
          state={levelError ? 'fail' : micOk ? 'ok' : 'pending'}
          detail={
            levelError ??
            (micOk ? (heard ? 'Input detected — we can hear you.' : 'Access granted. Say something to see the meter move.') : 'Asking…')
          }
        >
          <div className="mt-2 flex items-center gap-2">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--ln-panel-2)' }}
              role="presentation"
            >
              <div
                className="h-full rounded-full transition-[width] duration-75"
                style={{
                  width: `${Math.round(Math.min(1, level * 1.6) * 100)}%`,
                  backgroundColor: levelError ? 'var(--ln-danger)' : heard ? 'var(--ln-ok)' : 'var(--ln-dim)',
                }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-[0.6875rem] tabular-nums" style={{ color: 'var(--ln-faint)' }}>
              {levelError ? '—' : `${Math.round(level * 100)}%`}
            </span>
          </div>
        </Row>

        {/* 2. Speech recognition */}
        <Row
          label="Speech recognition"
          state={!support.supported ? 'fail' : probe === 'heard' ? 'ok' : probe === 'failed' ? 'fail' : 'pending'}
          detail={
            !support.supported
              ? (support.reason ?? 'Not available in this browser.')
              : probe === 'heard'
                ? 'Recognised what you said. Recording will work.'
                : probe === 'failed'
                  ? (failure ?? 'The recogniser could not run.')
                  : probe === 'listening'
                    ? 'Listening for a few seconds — say a sentence now.'
                    : 'Not tested yet. Press Test recognition and say a short sentence.'
          }
        >
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={probe === 'listening' ? stopProbe : startProbe}
              disabled={!support.supported}
              className="ln-btn ln-btn-ghost h-7 gap-1.5 text-[0.75rem]"
            >
              {probe === 'listening' ? (
                <>
                  <Square size={10} aria-hidden /> Stop
                </>
              ) : (
                <>
                  <Mic size={11} aria-hidden /> Test recognition
                </>
              )}
            </button>
            {probe === 'listening' ? (
              <Loader2 size={12} className="animate-spin" style={{ color: 'var(--ln-muted)' }} aria-hidden />
            ) : null}
          </div>
          {transcript ? (
            <p
              className="mt-2 rounded-md px-2.5 py-2 text-[0.75rem] leading-relaxed"
              style={{ backgroundColor: 'var(--ln-panel-2)', color: 'var(--ln-text)' }}
            >
              “{transcript}”
            </p>
          ) : null}
        </Row>

        <p className="mt-3 text-[0.6875rem] leading-relaxed" style={{ color: 'var(--ln-faint)' }}>
          Recognition needs a working connection and, in Chrome and Edge, works best with one tab recording at a
          time. If the meter moves but recognition stays silent, try another browser — or type instead, which is
          translated and saved exactly the same way.
        </p>
      </div>
    </div>
  );
}

/** One labelled check with an icon that reflects its outcome. */
function Row({
  label,
  state,
  detail,
  children,
}: {
  label: string;
  state: 'ok' | 'fail' | 'pending';
  detail: string;
  children?: React.ReactNode;
}) {
  const color = state === 'ok' ? 'var(--ln-ok)' : state === 'fail' ? 'var(--ln-danger)' : 'var(--ln-dim)';
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-1">
      <div className="flex items-center gap-2">
        <span style={{ color }} aria-hidden>
          {state === 'ok' ? (
            <Check size={13} />
          ) : state === 'fail' ? (
            <MicOff size={13} />
          ) : (
            <Mic size={13} />
          )}
        </span>
        <span className="text-[0.8125rem] font-semibold">{label}</span>
        {state === 'pending' ? (
          <span className="text-[0.625rem] uppercase tracking-[0.06em]" style={{ color: 'var(--ln-faint)' }}>
            waiting
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 pl-5 text-[0.75rem] leading-relaxed" style={{ color: state === 'fail' ? color : 'var(--ln-muted)' }}>
        {state === 'fail' ? (
          <span className="inline-flex items-start gap-1">
            <TriangleAlert size={10} className="mt-0.5 shrink-0" aria-hidden />
            {detail}
          </span>
        ) : (
          detail
        )}
      </p>
      {children}
    </div>
  );
}
