import { useEffect, useState } from 'react';
import type { Lang, RecorderState } from '../types';
import { LANG_NAME } from '../types';
import { formatDuration } from '../lib/util';

/** Re-renders once a second while `active`, for the recording timer. */
export function useElapsed(startedAt: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !startedAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, now - startedAt);
}

/**
 * The record button: one control for both languages.
 *
 * It is deliberately the only way to start listening — there is no per-language
 * variant, because the point of the unified mode is that the app works out which
 * language is being spoken.
 */
export function RecordButton({
  state,
  onToggle,
  disabled,
  full,
}: {
  state: RecorderState;
  onToggle: () => void;
  disabled?: boolean;
  full?: boolean;
}) {
  const recording = state === 'listening' || state === 'starting';
  const label = recording ? 'Stop' : state === 'error' ? 'Retry' : 'Start';
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      data-recording={recording ? 'true' : 'false'}
      aria-pressed={recording}
      className="ln-record-btn"
      style={full ? { width: '100%', justifyContent: 'center', padding: '16px', fontSize: '16px' } : undefined}
    >
      <span className="ln-record-mark" aria-hidden />
      {label}
    </button>
  );
}

/** Dot + word describing what the microphone is doing. */
export function RecordStatus({
  state,
  liveLang,
  engine = 'browser',
  tone = 'inline',
}: {
  state: RecorderState;
  liveLang: Lang;
  /** The local model detects per sentence, so it has no single listening language. */
  engine?: 'browser' | 'local';
  tone?: 'inline' | 'chip';
}) {
  const recording = state === 'listening';
  const starting = state === 'starting';
  const text = recording
    ? engine === 'local'
      ? 'Listening · on-device'
      : `Listening · ${LANG_NAME[liveLang]}`
    : starting
      ? 'Starting…'
      : state === 'error'
        ? 'Microphone problem'
        : 'Paused';

  const dot = (
    <span
      aria-hidden
      className={recording ? 'ln-dot-live' : undefined}
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        display: 'inline-block',
        background: recording
          ? 'var(--ln-record)'
          : state === 'error'
            ? 'var(--ln-danger)'
            : 'var(--ln-dim)',
      }}
    />
  );

  if (tone === 'chip') {
    return (
      <span className="ln-stat" style={{ color: 'var(--ln-muted)' }}>
        {dot}
        {text}
      </span>
    );
  }

  return (
    <span
      className="flex min-w-[84px] items-center gap-2 text-[0.8125rem]"
      style={{ color: 'var(--ln-muted)' }}
      aria-live="polite"
    >
      {dot}
      {text}
    </span>
  );
}

/** `04:12` while recording, otherwise the session length so far. */
export function RecordingTimer({
  startedAt,
  recording,
  fallbackMs,
  className,
  style,
}: {
  startedAt: number | null;
  recording: boolean;
  fallbackMs?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const elapsed = useElapsed(startedAt, recording);
  const ms = recording ? elapsed : startedAt ? elapsed : (fallbackMs ?? 0);
  return (
    <span className={className} style={style}>
      {formatDuration(ms)}
    </span>
  );
}
