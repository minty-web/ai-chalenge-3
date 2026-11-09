import { useEffect, useRef } from 'react';
import { Loader2, Mic, Sparkles } from 'lucide-react';
import type { Entry } from '../types';
import { LANG_NAME } from '../types';
import { EntryCard } from './EntryCard';

interface Props {
  entries: Entry[];
  interim: string;
  showInterim: boolean;
  autoScroll: boolean;
  sourceLang: 'fi' | 'en';
  targetLang: 'fi' | 'en';
  listening: boolean;
  booting: boolean;
  onRetry: (id: string) => Promise<void> | void;
  onEdit: (id: string, text: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onCopy: (text: string) => void;
}

export function Notebook({
  entries,
  interim,
  showInterim,
  autoScroll,
  sourceLang,
  targetLang,
  listening,
  booting,
  onRetry,
  onEdit,
  onDelete,
  onCopy,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Track whether the user scrolled away from the end; if so, stop hijacking.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = distance < 120;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: entries.length > 1 ? 'smooth' : 'auto', block: 'end' });
  }, [entries.length, interim, autoScroll]);

  if (booting) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex items-center gap-2 text-[0.8125rem] text-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Opening your notebook…
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4" role="log" aria-live="polite" aria-relevant="additions text">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {entries.length === 0 ? (
          <EmptyState listening={listening} sourceLang={sourceLang} targetLang={targetLang} />
        ) : null}

        {entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            onRetry={onRetry}
            onEdit={onEdit}
            onDelete={onDelete}
            onCopy={onCopy}
          />
        ))}

        {showInterim && interim ? (
          <div className="rounded-xl border border-dashed border-line bg-panel/50 p-3 sm:p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'var(--ln-accent)' }}
              >
                {LANG_NAME[sourceLang]}
              </span>
              <span className="ln-chip" style={{ paddingInline: 6 }}>
                <Mic size={8} aria-hidden /> live
              </span>
            </div>
            <p className="text-[0.9375rem] italic leading-snug text-muted">{interim}</p>
            <div className="mt-2 flex items-center gap-2">
              <Loader2 size={10} className="animate-spin text-muted" aria-hidden />
              <span className="text-[0.6875rem] text-muted">Waiting for a finished sentence…</span>
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} className="h-px w-full" aria-hidden />
      </div>
    </div>
  );
}

function EmptyState({
  listening,
  sourceLang,
  targetLang,
}: {
  listening: boolean;
  sourceLang: 'fi' | 'en';
  targetLang: 'fi' | 'en';
}) {
  const samples =
    sourceLang === 'fi'
      ? ['Hei, mitä kuuluu?', 'Olen tänään menossa kouluun.', 'Minulla on huomenna tärkeä koe.']
      : ['Hi, how are you?', "I'm going to school today.", 'Tomorrow I have an important examination.'];
  const translated =
    sourceLang === 'fi'
      ? ['Hi, how are you?', "I'm going to school today.", 'Tomorrow I have an important examination.']
      : ['Hei, mitä kuuluu?', 'Olen tänään menossa kouluun.', 'Minulla on huomenna tärkeä koe.'];

  return (
    <div className="flex flex-col items-center px-2 py-10 text-center">
      <span
        className="mb-3 grid h-11 w-11 place-items-center rounded-xl"
        style={{ backgroundColor: 'var(--ln-accent-soft)', color: 'var(--ln-accent)' }}
        aria-hidden
      >
        <Sparkles size={19} />
      </span>
      <h2 className="text-[0.9375rem] font-semibold text-ink">
        {listening ? 'Listening — start speaking' : 'Your notebook is empty'}
      </h2>
      <p className="mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
        {listening
          ? 'Each finished sentence appears here with its translation. Pauses are fine — recognition restarts automatically.'
          : `Press Start recording and speak ${LANG_NAME[sourceLang]}, or type a sentence below. Every line is translated into ${LANG_NAME[targetLang]} and saved on this device.`}
      </p>

      <div className="mt-5 w-full max-w-md space-y-2 text-left">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
          Example pair
        </p>
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--ln-accent)' }}>
            {LANG_NAME[sourceLang]}
          </p>
          <p className="mt-0.5 text-[0.875rem] font-medium leading-snug text-ink">{samples[0]}</p>
          <p className="mt-2 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
            {LANG_NAME[targetLang]}
          </p>
          <p className="mt-0.5 text-[0.875rem] leading-snug" style={{ color: 'var(--ln-accent)' }}>
            {translated[0]}
          </p>
        </div>
        <p className="pt-1 text-[0.6875rem] leading-relaxed text-muted">
          Everything stays in this browser. Use <strong className="font-semibold text-ink">Export</strong> to keep a
          copy as TXT or Markdown.
        </p>
      </div>
    </div>
  );
}