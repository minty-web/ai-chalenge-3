import { useEffect, useRef } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { Entry, Lang } from '../types';
import { LANG_CODE } from '../types';
import type { InterimLine } from '../hooks/useAppStore';
import { EntryRow } from './EntryRow';

/** Example pair shown before the conversation starts. */
const SAMPLES: { lang: Lang; text: string; translation: string }[] = [
  { lang: 'fi', text: 'Hei, mitä kuuluu?', translation: 'Hey, how are you?' },
  { lang: 'en', text: 'Thanks, I try to speak every day.', translation: 'Kiitos, yritän puhua joka päivä.' },
];

function langColor(lang: Lang): string {
  return lang === 'fi' ? 'var(--ln-fi)' : 'var(--ln-en)';
}

export function Notebook({
  entries,
  interim,
  showInterim,
  autoScroll,
  listening,
  booting,
  onRetry,
  onEdit,
  onDelete,
  onSwapLanguage,
  onCopy,
}: {
  entries: Entry[];
  interim: InterimLine | null;
  showInterim: boolean;
  autoScroll: boolean;
  listening: boolean;
  booting: boolean;
  onRetry: (id: string) => Promise<void> | void;
  onEdit: (id: string, text: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onSwapLanguage: (id: string) => Promise<void> | void;
  onCopy: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // If the user scrolls up to re-read something, stop pulling them back down.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!autoScroll || !stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: entries.length > 1 ? 'smooth' : 'auto', block: 'end' });
  }, [entries.length, interim?.text, autoScroll]);

  if (booting) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <span className="flex items-center gap-2 text-[0.8125rem]" style={{ color: 'var(--ln-muted)' }}>
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Opening your notebook…
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="ln-feed max-h-[38dvh] min-h-[10rem] overflow-y-auto overscroll-contain md:max-h-[520px] lg:max-h-[620px]"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Conversation"
    >
      {entries.length === 0 && !(showInterim && interim) ? <EmptyState listening={listening} /> : null}

      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          onRetry={onRetry}
          onEdit={onEdit}
          onDelete={onDelete}
          onSwapLanguage={onSwapLanguage}
          onCopy={onCopy}
        />
      ))}

      {showInterim && interim ? (
        <div className="border-b border-line-soft px-4 py-3.5 last:border-b-0 md:px-[22px] md:py-4 lg:px-7 lg:py-[18px]">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="ln-langbadge" style={{ color: langColor(interim.lang) }}>
              {LANG_CODE[interim.lang]}
            </span>
            <span className="text-[0.6875rem] md:text-xs" style={{ color: 'var(--ln-faint)' }}>
              now
            </span>
          </div>
          <p
            className="text-[0.9375rem] italic leading-[1.45] md:text-base lg:text-[17px]"
            style={{ color: 'var(--ln-dim)' }}
          >
            {interim.text}
            <span className="ln-cursor ml-0.5 not-italic" aria-hidden>
              |
            </span>
          </p>
        </div>
      ) : null}

      <div ref={bottomRef} className="h-px w-full" aria-hidden />
    </div>
  );
}

function EmptyState({ listening }: { listening: boolean }) {
  return (
    <div className="px-4 py-8 md:px-[22px] lg:px-7 lg:py-10">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: 'var(--ln-panel-2)', color: 'var(--ln-accent)' }}
          aria-hidden
        >
          <Sparkles size={14} />
        </span>
        <div>
          <p className="ln-display text-[0.9375rem] font-semibold text-ink">
            {listening ? 'Listening — speak Finnish or English' : 'Nothing captured yet'}
          </p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed" style={{ color: 'var(--ln-dim)' }}>
            {listening
              ? 'Each finished sentence lands here in the language you spoke it, translated into the other.'
              : 'Press Start and talk in either language, or type a line below. The language of every sentence is worked out for you.'}
          </p>
        </div>
      </div>

      <p className="ln-eyebrow mt-6">Example</p>
      <div className="mt-2">
        {SAMPLES.map((sample, i) => (
          <div
            key={sample.text}
            className={i === 0 ? 'pb-2.5' : 'pt-2.5'}
            style={{ borderTop: i === 0 ? undefined : '1px solid var(--ln-border-soft)' }}
          >
            <div className="flex items-center gap-2">
              <span className="ln-langbadge" style={{ color: langColor(sample.lang) }}>
                {LANG_CODE[sample.lang]}
              </span>
            </div>
            <p className="mt-1.5 text-[0.9375rem] font-semibold leading-snug text-ink">{sample.text}</p>
            <p className="mt-0.5 flex gap-2 text-[0.8125rem] leading-snug" style={{ color: 'var(--ln-muted)' }}>
              <span aria-hidden style={{ color: 'var(--ln-arrow)' }}>
                ↳
              </span>
              {sample.translation}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
