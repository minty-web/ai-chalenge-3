import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import type { AppStore } from '../hooks/useAppStore';
import { formatClockSeconds, formatDuration } from '../lib/util';

/**
 * The three cards beside the feed on a wide screen: what this session is, proof
 * that it is being saved, and the two ways out of it.
 *
 * They are the calmest part of the interface on purpose — everything a speaker
 * needs mid-conversation is in the header, and this rail is for looking things up.
 */
export function SideRail({
  store,
  onExport,
  onOpenSessions,
}: {
  store: AppStore;
  onExport: (format: 'md' | 'txt') => void;
  onOpenSessions: () => void;
}) {
  const { session, entries, savedAt, saving, storageFault, recordingStartedAt, recorder } = store;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(session?.title ?? '');

  const lines = entries.length;
  const span = session ? Math.max(0, session.updatedAt - session.createdAt) : 0;
  const live = recorder === 'listening' && recordingStartedAt ? Date.now() - recordingStartedAt : 0;

  const startRename = () => {
    setDraft(session?.title ?? '');
    setRenaming(true);
  };

  const commit = () => {
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== session?.title) void store.renameSession(next);
  };

  const savedLabel = storageFault
    ? 'Not saving'
    : saving
      ? 'Saving…'
      : savedAt
        ? `Saved ${formatClockSeconds(savedAt)}`
        : 'Not saved yet';

  return (
    <div className="flex flex-col gap-3">
      <section className="ln-surface px-[18px] py-4" aria-labelledby="rail-session">
        <h2 id="rail-session" className="ln-eyebrow">
          Session
        </h2>
        {renaming ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setRenaming(false);
              }}
              autoFocus
              className="ln-input h-8 py-1 text-[0.875rem] font-semibold"
              aria-label="Session name"
            />
            <button
              type="button"
              onClick={commit}
              className="ln-btn ln-btn-ghost h-8 w-8 shrink-0 p-0"
              aria-label="Save name"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="ln-btn ln-btn-ghost h-8 w-8 shrink-0 p-0"
              aria-label="Cancel rename"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="group/name mt-1 flex items-start gap-1.5">
            <p className="ln-display min-w-0 flex-1 break-words text-[1rem] font-semibold leading-snug text-ink">
              {session?.title ?? 'No session'}
            </p>
            <button
              type="button"
              onClick={startRename}
              className="ln-btn ln-btn-ghost h-6 w-6 shrink-0 border-transparent p-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/name:opacity-100"
              aria-label="Rename this session"
              title="Rename"
            >
              <Pencil size={11} />
            </button>
          </div>
        )}
        <p className="mt-1 text-[0.8125rem]" style={{ color: 'var(--ln-muted)' }}>
          {live > 0 ? `${formatDuration(live)} · recording` : formatDuration(span)} · {lines}{' '}
          {lines === 1 ? 'line' : 'lines'} captured
        </p>
      </section>

      <section className="ln-surface px-[18px] py-4" aria-labelledby="rail-saved">
        <h2 id="rail-saved" className="ln-eyebrow">
          Saved locally
        </h2>
        <div className="mt-2 flex items-start gap-2.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="mt-0.5 shrink-0"
            aria-hidden
            style={{ color: storageFault ? 'var(--ln-danger)' : 'var(--ln-ok)' }}
          >
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="min-w-0">
            <p className="text-[0.8125rem] leading-snug text-ink">
              {storageFault ? 'This browser refused to save' : 'Every line is kept on this device'}
            </p>
            <p className="mt-0.5 text-[0.8125rem]" style={{ color: 'var(--ln-muted)' }}>
              {savedLabel}
            </p>
          </div>
        </div>
        {storageFault ? (
          <p className="mt-2 text-[0.6875rem] leading-relaxed" style={{ color: 'var(--ln-danger)' }}>
            {storageFault}
          </p>
        ) : null}
      </section>

      <section className="ln-surface px-[18px] py-4" aria-labelledby="rail-export">
        <h2 id="rail-export" className="ln-eyebrow">
          Export
        </h2>
        <div className="mt-2 flex flex-col gap-1.5">
          <button type="button" className="ln-cardbtn" onClick={() => onExport('txt')}>
            Export .txt
          </button>
          <button type="button" className="ln-cardbtn" onClick={() => onExport('md')}>
            Export .md
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenSessions}
          className="mt-3 text-[0.8125rem] transition-opacity hover:opacity-80"
          style={{ color: 'var(--ln-brand-2)' }}
        >
          View saved notebooks →
        </button>
      </section>
    </div>
  );
}
