import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
  Waves,
  Keyboard,
} from 'lucide-react';
import type { Entry } from '../types';
import { LANG_NAME } from '../types';
import { formatClock } from '../lib/util';

interface Props {
  entry: Entry;
  onRetry: (id: string) => Promise<void> | void;
  onEdit: (id: string, text: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onCopy: (text: string) => void;
}

export function EntryCard({ entry, onRetry, onEdit, onDelete, onCopy }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.sourceText);
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(entry.sourceText);
  }, [entry.sourceText, editing]);

  useEffect(() => {
    if (editing) {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  const save = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== entry.sourceText) void onEdit(entry.id, next);
    else setDraft(entry.sourceText);
  };

  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry(entry.id);
    } finally {
      setRetrying(false);
    }
  };

  const copy = () => {
    const text = entry.translation ? `${entry.sourceText}\n${entry.translation}` : entry.sourceText;
    onCopy(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const pending = entry.status === 'pending';
  const failed = entry.status === 'error';

  return (
    <article
      className="group relative animate-fade-up rounded-xl border bg-panel p-3 transition-colors sm:p-4"
      style={{
        borderColor: failed
          ? 'color-mix(in srgb, var(--ln-danger) 40%, var(--ln-border))'
          : 'var(--ln-border)',
      }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]"
          style={{ color: 'var(--ln-accent)' }}
        >
          {LANG_NAME[entry.sourceLang]}
        </span>
        <span className="h-2.5 w-px bg-line" aria-hidden />
        <span className="flex items-center gap-1 text-[0.625rem] font-medium text-muted">
          {entry.origin === 'speech' ? <Waves size={9} aria-hidden /> : <Keyboard size={9} aria-hidden />}
          {entry.origin === 'speech' ? 'speech' : 'typed'}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <time
            className="font-mono text-[0.6875rem] tabular-nums text-muted"
            dateTime={new Date(entry.createdAt).toISOString()}
          >
            {formatClock(entry.createdAt)}
          </time>
        </span>
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
        <p className="text-[0.9375rem] font-medium leading-snug text-ink">{entry.sourceText}</p>
      )}

      <div className="mt-2.5 border-t border-line pt-2.5">
        <span
          className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted"
          aria-hidden
        >
          {LANG_NAME[entry.targetLang]}
        </span>

        {pending ? (
          <div className="flex items-center gap-2" aria-live="polite">
            <Loader2 size={12} className="animate-spin text-muted" aria-hidden />
            <span className="text-[0.8125rem] text-muted">Translating…</span>
            <span className="ln-skeleton h-3 flex-1 max-w-[12rem]" aria-hidden />
          </div>
        ) : failed ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[0.8125rem]" style={{ color: 'var(--ln-danger)' }}>
              <TriangleAlert size={12} aria-hidden />
              Translation failed
            </span>
            <button
              type="button"
              onClick={retry}
              disabled={retrying}
              className="ln-btn ln-btn-ghost h-6 gap-1 px-2 text-[0.6875rem]"
            >
              {retrying ? (
                <Loader2 size={10} className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw size={10} aria-hidden />
              )}
              Retry
            </button>
            {entry.error ? (
              <span className="w-full text-[0.6875rem] leading-relaxed text-muted" title={entry.error}>
                {entry.error}
              </span>
            ) : null}
          </div>
        ) : entry.translation ? (
          <p className="text-[0.9375rem] leading-snug" style={{ color: 'var(--ln-accent)' }}>
            {entry.translation}
          </p>
        ) : (
          <p className="text-[0.8125rem] italic text-muted">Translation off</p>
        )}

        {entry.fallback && entry.translation ? (
          <span
            className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] font-medium"
            style={{ backgroundColor: 'color-mix(in srgb, var(--ln-warn) 14%, transparent)', color: 'var(--ln-warn)' }}
            title="All online engines failed; this line came from the built-in offline phrasebook."
          >
            <TriangleAlert size={9} aria-hidden /> offline phrasebook
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
          onClick={copy}
          className="ln-btn ln-btn-ghost h-6 gap-1 border-transparent px-1.5 text-[0.6875rem] text-muted"
          title="Copy original and translation"
        >
          {copied ? <Check size={10} aria-hidden /> : <Copy size={10} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="ln-btn ln-btn-ghost h-6 gap-1 border-transparent px-1.5 text-[0.6875rem] text-muted"
          title="Translate again"
        >
          {retrying ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <RefreshCw size={10} aria-hidden />}
          Re-translate
        </button>
        <button
          type="button"
          onClick={() => void onDelete(entry.id)}
          className="ln-btn ln-btn-ghost ml-auto h-6 gap-1 border-transparent px-1.5 text-[0.6875rem]"
          style={{ color: 'var(--ln-danger)' }}
          title="Delete this entry"
        >
          <Trash2 size={10} aria-hidden /> Delete
        </button>
      </div>
    </article>
  );
}