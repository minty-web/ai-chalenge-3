import { useEffect, useMemo, useState } from 'react';
import { Clock, Plus, Search, Trash2, X } from 'lucide-react';
import type { AppStore } from '../hooks/useAppStore';
import type { Session } from '../types';
import { DIRECTIONS } from '../types';
import { formatDateTime } from '../lib/util';
import { ConfirmDialog } from './ConfirmDialog';
import { countEntries } from '../lib/db';

/**
 * Saved notebooks. A sheet rather than a permanent column: the reference layout
 * gives the conversation the full width and keeps history one click away.
 */
export function SessionsPanel({
  store,
  open,
  onClose,
}: {
  store: AppStore;
  open: boolean;
  onClose: () => void;
}) {
  const { sessions, session, openSession, deleteSession, startNewSession } = store;
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Session | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPending(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, number> = {};
      for (const s of sessions) {
        try {
          next[s.id] = await countEntries(s.id);
        } catch {
          next[s.id] = 0;
        }
      }
      if (!cancelled) setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.title.toLocaleLowerCase().includes(q) ||
        DIRECTIONS[s.direction].label.toLocaleLowerCase().includes(q),
    );
  }, [sessions, query]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex justify-end bg-black/45" onClick={onClose} role="presentation">
        <div
          className="flex h-full w-full max-w-sm flex-col border-l border-line bg-panel shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sessions-title"
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
            <h2 id="sessions-title" className="ln-display flex-1 text-[0.9375rem] font-semibold text-ink">
              Saved notebooks
            </h2>
            <button
              type="button"
              onClick={() => {
                void startNewSession();
                onClose();
              }}
              className="ln-btn ln-btn-subtle h-7 gap-1 px-2 text-[0.6875rem] font-semibold"
              title="Start a new session"
            >
              <Plus size={11} aria-hidden /> New
            </button>
            <button type="button" onClick={onClose} className="ln-btn ln-btn-ghost ln-btn-icon" aria-label="Close">
              <X size={15} />
            </button>
          </div>

          <div className="shrink-0 border-b border-line px-4 py-2.5">
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--ln-faint)' }}
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or direction…"
                className="ln-input h-8 py-1 pl-7 text-[0.75rem]"
                aria-label="Search sessions"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-8 text-center text-[0.75rem]" style={{ color: 'var(--ln-muted)' }}>
                {query ? 'Nothing matches that search.' : 'No saved notebooks yet.'}
              </p>
            ) : (
              <ul>
                {filtered.map((s) => {
                  const active = s.id === session?.id;
                  return (
                    <li key={s.id}>
                      <div
                        className="group flex items-start gap-1 rounded-lg px-2 py-2 transition-colors"
                        style={{ backgroundColor: active ? 'var(--ln-panel-2)' : 'transparent' }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void openSession(s.id);
                            onClose();
                          }}
                          className="min-w-0 flex-1 text-left"
                          aria-current={active ? 'true' : undefined}
                        >
                          <span
                            className="block truncate text-[0.8125rem] font-medium"
                            style={{ color: active ? 'var(--ln-accent)' : 'var(--ln-text)' }}
                          >
                            {s.title}
                          </span>
                          <span
                            className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem]"
                            style={{ color: 'var(--ln-muted)' }}
                          >
                            <span className="truncate">{DIRECTIONS[s.direction].label}</span>
                            <span aria-hidden>·</span>
                            <span>{counts[s.id] ?? 0} lines</span>
                          </span>
                          <span
                            className="mt-0.5 flex items-center gap-1 text-[0.625rem]"
                            style={{ color: 'var(--ln-faint)' }}
                          >
                            <Clock size={8} aria-hidden />
                            {formatDateTime(s.updatedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPending(s)}
                          className="ln-btn ln-btn-ghost ln-btn-icon h-6 w-6 shrink-0 border-transparent opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                          style={{ color: 'var(--ln-danger)' }}
                          aria-label={`Delete ${s.title}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-line px-4 py-2.5">
            <p className="text-[0.625rem] leading-relaxed" style={{ color: 'var(--ln-faint)' }}>
              Stored in this browser only. Nothing is uploaded unless you use an online translation engine.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={`Delete “${pending?.title ?? ''}”?`}
        body="Every line in this notebook is removed from this browser. Export it first if you want to keep a copy. This cannot be undone."
        confirmLabel="Delete notebook"
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (target) void deleteSession(target.id);
        }}
      />
    </>
  );
}
