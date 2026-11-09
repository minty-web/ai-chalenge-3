import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Plus, Search, Trash2, X, Clock } from 'lucide-react';
import type { AppStore } from '../hooks/useAppStore';
import type { Session } from '../types';
import { DIRECTIONS } from '../types';
import { formatDateTime } from '../lib/util';

interface Props {
  store: AppStore;
  open: boolean;
  onClose: () => void;
}

export function SessionDrawer({ store, open, onClose }: Props) {
  const { sessions, session, openSession, deleteSession, startNewSession } = store;
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setPendingDelete(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.title.toLocaleLowerCase().includes(q) ||
        DIRECTIONS[s.direction].label.toLocaleLowerCase().includes(q),
    );
  }, [sessions, query]);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-[19rem] flex-col border-r border-line bg-panel transition-transform duration-200',
          'lg:static lg:z-0 lg:translate-x-0',
          open ? 'translate-x-0 shadow-2xl lg:shadow-none' : '-translate-x-full',
        ].join(' ')}
        aria-label="Saved sessions"
        aria-hidden={!open ? undefined : undefined}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
          <h2 className="flex-1 text-[0.8125rem] font-semibold text-ink">Sessions</h2>
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
          <button
            type="button"
            onClick={onClose}
            className="ln-btn ln-btn-ghost ln-btn-icon lg:hidden"
            aria-label="Close session list"
          >
            <X size={14} />
          </button>
        </div>

        <div className="border-b border-line px-3 py-2">
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              className="ln-input h-8 py-1 pl-7 text-[0.75rem]"
              aria-label="Search sessions"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-[0.75rem] text-muted">
              {query ? 'No session matches that search.' : 'No saved sessions yet.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((s) => {
                const active = s.id === session?.id;
                return (
                  <li key={s.id}>
                    <div
                      className="group relative flex items-start gap-2 rounded-lg px-2 py-2 transition-colors"
                      style={
                        active
                          ? { backgroundColor: 'var(--ln-accent-soft)' }
                          : { backgroundColor: 'transparent' }
                      }
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
                        <span className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-muted">
                          <span aria-hidden>{DIRECTIONS[s.direction].flag}</span>
                          <span className="truncate">{DIRECTIONS[s.direction].label}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-[0.625rem] text-muted">
                          <Clock size={8} aria-hidden />
                          {formatDateTime(s.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(s)}
                        className="ln-btn ln-btn-ghost ln-btn-icon h-6 w-6 shrink-0 border-transparent opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        style={{ color: 'var(--ln-danger)' }}
                        aria-label={`Delete session ${s.title}`}
                      >
                        <Trash2 size={11} />
                      </button>
                      {active ? (
                        <MessageSquare
                          size={11}
                          className="absolute right-2 top-2 opacity-0 group-hover:opacity-0"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-line px-3 py-2">
          <p className="text-[0.625rem] leading-relaxed text-muted">
            Stored in this browser only (IndexedDB). Nothing leaves your device unless you enable an online
            translation engine.
          </p>
        </div>
      </aside>

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPendingDelete(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-line bg-panel p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-session-title"
          >
            <h3 id="delete-session-title" className="text-[0.9375rem] font-semibold text-ink">
              Delete “{pendingDelete.title}”?
            </h3>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
              Every entry in this session is removed from this browser. Export it first if you want to keep a
              copy. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ln-btn ln-btn-ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ln-btn ln-btn-danger"
                onClick={() => {
                  const target = pendingDelete;
                  setPendingDelete(null);
                  void deleteSession(target.id);
                }}
              >
                Delete session
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}