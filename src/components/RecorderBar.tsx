import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CircleDot,
  Ear,
  Loader2,
  Mic,
  MicOff,
  Square,
  Volume2,
} from 'lucide-react';
import type { MicState, RecorderState } from '../types';
import { formatDuration } from '../lib/util';

interface Props {
  state: RecorderState;
  mic: MicState;
  startedAt: number | null;
  interim: string;
  supported: boolean;
  supportReason: string | null;
  localeLabel: string;
  onStart: () => void;
  onStop: () => void;
}

const MIC_TEXT: Record<MicState, string> = {
  unknown: 'Microphone not checked',
  granted: 'Microphone allowed',
  denied: 'Microphone blocked',
  unavailable: 'No microphone API',
};

export function RecorderBar({
  state,
  mic,
  startedAt,
  interim,
  supported,
  supportReason,
  localeLabel,
  onStart,
  onStop,
}: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const listening = state === 'listening';
  const starting = state === 'starting';
  const errored = state === 'error';

  const stateLabel = errored
    ? 'Recognition error'
    : starting
      ? 'Requesting microphone…'
      : listening
        ? 'Listening'
        : 'Idle';

  const stateColor = errored
    ? 'var(--ln-danger)'
    : listening
      ? 'var(--ln-ok)'
      : starting
        ? 'var(--ln-warn)'
        : 'var(--ln-muted)';

  return (
    <section className="ln-surface overflow-hidden" aria-label="Recording controls">
      <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        {listening || starting ? (
          <button
            type="button"
            onClick={onStop}
            className="ln-btn relative h-10 shrink-0 gap-2 px-4 text-[0.8125rem] font-semibold text-white"
            style={{ backgroundColor: 'var(--ln-danger)' }}
          >
            <span className="absolute inset-0 rounded-lg border-2 border-[color:var(--ln-danger)] animate-pulse-ring" aria-hidden />
            <Square size={14} fill="currentColor" aria-hidden />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={!supported}
            className="ln-btn h-10 shrink-0 gap-2 px-4 text-[0.8125rem] font-semibold"
            style={
              supported
                ? { backgroundColor: 'var(--ln-accent)', color: 'var(--ln-accent-ink)' }
                : { backgroundColor: 'var(--ln-panel-2)', color: 'var(--ln-muted)' }
            }
            title={supported ? 'Start listening' : (supportReason ?? 'Unavailable')}
          >
            <Mic size={15} aria-hidden />
            {errored ? 'Try again' : 'Start recording'}
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="flex items-center gap-1.5">
            <span
              className="relative flex h-2 w-2 shrink-0"
              aria-hidden
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: stateColor }}
              />
              {listening ? (
                <span
                  className="absolute inset-0 animate-ping rounded-full opacity-70"
                  style={{ backgroundColor: stateColor }}
                />
              ) : null}
            </span>
            <span className="text-[0.8125rem] font-semibold" style={{ color: stateColor }}>
              {stateLabel}
            </span>
            {listening ? (
              <span className="font-mono text-[0.8125rem] tabular-nums text-muted">{formatDuration(elapsed)}</span>
            ) : null}
          </span>

          <span className="flex items-center gap-1.5 text-[0.75rem] text-muted" title={MIC_TEXT[mic]}>
            {mic === 'denied' || mic === 'unavailable' ? (
              <MicOff size={12} style={{ color: 'var(--ln-danger)' }} aria-hidden />
            ) : (
              <Ear size={12} aria-hidden />
            )}
            <span className="hidden sm:inline">{MIC_TEXT[mic]}</span>
          </span>

          <span className="hidden items-center gap-1.5 text-[0.75rem] text-muted sm:flex">
            <CircleDot size={11} aria-hidden />
            Recognising <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.6875rem]">{localeLabel}</code>
          </span>
        </div>

        <span
          className="ln-chip shrink-0"
          title={supported ? 'Web Speech API available in this browser' : (supportReason ?? '')}
        >
          {supported ? <Volume2 size={10} aria-hidden /> : <AlertCircle size={10} aria-hidden />}
          {supported ? 'Speech API ready' : 'Speech API unavailable'}
        </span>
      </div>

      {!supported ? (
        <p
          className="flex items-start gap-2 border-t border-line px-3 py-2 text-[0.75rem] leading-relaxed sm:px-4"
          style={{ color: 'var(--ln-warn)' }}
        >
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Live speech is unavailable here. {supportReason ?? ''} Type your sentence in the box below — it is translated
            and saved exactly the same way.
          </span>
        </p>
      ) : null}

      {listening ? (
        <div className="flex min-h-[2.5rem] items-start gap-2 border-t border-line px-3 py-2 sm:px-4">
          <span className="mt-1 shrink-0 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Heard
          </span>
          <p className="min-w-0 flex-1 text-[0.8125rem] italic leading-relaxed text-muted">
            {interim || <span className="opacity-60">Speak now…</span>}
          </p>
          {interim ? <Loader2 size={12} className="mt-1 shrink-0 animate-spin text-muted" aria-hidden /> : null}
        </div>
      ) : null}
    </section>
  );
}