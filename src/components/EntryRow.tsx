import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { Entry } from '../types';
import { LANG_CODE } from '../types';
import { formatClock } from '../lib/util';

/** Badge colour follows the language, not the role in the pair. */
function langColor(lang: Entry['sourceLang']): string {
  return lang === 'fi' ? 'var(--ln-fi)' : 'var(--ln-en)';
}

function Badge({ lang }: { lang: Entry['sourceLang'] }) {
  return (
    <span className="ln-langbadge" style={{ color: langColor(lang) }}>
      {LANG_CODE[lang]}
    </span>
  );
}

/**
 * One line of the notebook: what was said, and what it means.
 *
 * The translation is introduced by a ↳ rather than a second badge row so a long
 * conversation reads as a single column, which is the whole point of the feed.
 */
export function EntryRow({
  entry,
  onRetry,
  onEdit,
  onDelete,
  onSwapLanguage,
  onCopy,
}: {
  entry: Entry;
  onRetry: (id: string) => Promise<void> | void;
  onEdit: (id: string, text: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onSwapLanguage: (id: string) => Promise<void> | void;
  onCopy: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.sourceText);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(entry.sourceText);
  }, [entry.sourceText, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const save = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== entry.sourceText) void onEdit(entry.id, next);
    else setDraft(entry.sourceText);
  };

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    onCopy(entry.translation ? `${entry.sourceText}\n${entry.translation}` : entry.sourceText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const pending = entry.status === 'pending';
  const failed = entry.status === 'error';

  return (
    <article className="group ln-enter relative border-b border-line-soft px-4 py-3.5 last:border-b-0 md:px-[22px] md:py-4 lg:px-7 lg:py-[18px]">
      <div className="mb-1.5 flex items-center gap-2">
        <Badge lang={entry.sourceLang} />
        <time
          className="text-[0.6875rem] tabular-nums md:text-xs"
          style={{ color: 'var(--ln-faint)' }}
          dateTime={new Date(entry.createdAt).toISOString()}
        >
          {formatClock(entry.createdAt)}
        </time>
        {entry.detected ? (
          <span className="text-[0.6875rem]" style={{ color: 'var(--ln-faint)' }} title="Language detected from the audio">
            auto
          </span>
        ) : null}
        {entry.origin === 'manual' ? (
          <span className="text-[0.6875rem]" style={{ color: 'var(--ln-faint)' }} title="Typed, not spoken">
            typed
          </span>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                save();
              }
              if (e.key === 'Escape') {
                setDraft(entry.sourceText);
                setEditing(false);
              }
            }}
            rows={2}
            className="ln-input resize-y leading-relaxed"
            aria-label="Edit the original sentence"
          />
          <div className="flex gap-1.5">
            <button type="button" onClick={save} className="ln-btn ln-btn-primary h-7 text-[0.75rem]">
              <Check size={12} aria-hidden /> Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(entry.sourceText);
                setEditing(false);
              }}
              className="ln-btn ln-btn-ghost h-7 text-[0.75rem]"
            >
              <X size={12} aria-hidden /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[0.9375rem] font-semibold leading-[1.45] text-ink md:text-base lg:text-[17px] lg:leading-1.5">
          {entry.sourceText}
        </p>
      )}

      <div className="mt-1.5 flex gap-2">
        <span aria-hidden className="select-none pt-0.5 text-sm leading-[1.6]" style={{ color: 'var(--ln-arrow)' }}>
          ↳
        </span>
        <div className="min-w-0 flex-1">
          {pending ? (
            <p className="flex items-center gap-2 py-0.5 text-[0.8125rem] text-muted" aria-live="polite">
              <Loader2 size={11} className="animate-spin" aria-hidden />
              Translating…
            </p>
          ) : failed ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="flex items-center gap-1.5 text-[0.8125rem]" style={{ color: 'var(--ln-danger)' }}>
                <TriangleAlert size={11} aria-hidden />
                Translation failed
              </span>
              <button
                type="button"
                onClick={() => void run(() => onRetry(entry.id))}
                disabled={busy}
                className="ln-btn ln-btn-ghost h-6 gap-1 px-2 text-[0.6875rem]"
              >
                {busy ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <RefreshCw size={10} aria-hidden />}
                Retry
              </button>
              {entry.error ? (
                <span className="w-full text-[0.6875rem] leading-relaxed" style={{ color: 'var(--ln-faint)' }}>
                  {entry.error}
                </span>
              ) : null}
            </div>
          ) : entry.translation ? (
            <p className="text-[0.8125rem] leading-[1.45] text-muted md:text-sm lg:text-[15px] lg:leading-1.5">
              {entry.translation}
            </p>
          ) : (
            <p className="text-[0.8125rem] italic" style={{ color: 'var(--ln-faint)' }}>
              Translation off
            </p>
          )}

          {entry.fallback && entry.translation ? (
            <span
              className="mt-1 inline-flex items-center gap-1 text-[0.6875rem]"
              style={{ color: 'var(--ln-warn)' }}
              title="Every online engine failed; this line came from the built-in offline phrasebook."
            >
              <TriangleAlert size={9} aria-hidden /> offline phrasebook
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-0.5 gap-y-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100 lg:absolute lg:bottom-1.5 lg:right-4 lg:mt-0 lg:rounded-md lg:px-1 lg:py-0.5"
        style={{ backgroundColor: 'color-mix(in srgb, var(--ln-panel-3) 92%, transparent)' }}
      >
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ln-btn ln-btn-ghost h-6 gap-1 border-transparent px-1.5 text-[0.6875rem] text-muted"
          title="Edit the original sentence"
        >
          <Pencil size={10} aria-hidden /> Edit
        </button>
        <button
          type="button"
          onClick={() => void run(() => onSwapLanguage(entry.id))}
          disabled={busy}
          className="ln-btn ln-btn-ghost h-6 gap-1 border-transparent px-1.5 text-[0.6875rem] text-muted"
          title="Wrong language detected? Swap it and translate the other way"
        >
          <ArrowLeftRight size={10} aria-hidden /> Swap
        </button>
        <button
          type="button"
          onClick={copy}
          className="ln-btn ln-btn-ghost h-6 gap-1 border-transparent px-1.5 text-[0.6875rem] text-muted"
          title="Copy original and translation"
        >
          {copied ? <Check size={10} aria-hidden /> : <Copy size={10} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => void run(() => onRetry(entry.id))}
          disabled={busy}
          className="ln-btn ln-btn-ghost h-6 gap-1 border-transparent px-1.5 text-[0.6875rem] text-muted"
          title="Translate again"
        >
          {busy ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <RefreshCw size={10} aria-hidden />}
          <span className="max-md:sr-only">Re-translate</span>
        </button>
        <button
          type="button"
          onClick={() => void onDelete(entry.id)}
          className="ln-btn ln-btn-ghost ml-auto h-6 gap-1 border-transparent px-1.5 text-[0.6875rem]"
          style={{ color: 'var(--ln-danger)' }}
          title="Delete this line"
        >
          <Trash2 size={10} aria-hidden /> <span className="max-md:sr-only">Delete</span>
        </button>
      </div>
    </article>
  );
}
