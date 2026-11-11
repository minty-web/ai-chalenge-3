import { Loader2, Settings, Sun, Moon, Monitor, Library, Menu } from 'lucide-react';
import type { AppStore } from '../hooks/useAppStore';
import { Wordmark } from './Logo';
import { themeNext } from '../lib/util';

/**
 * Top bar: brand, tagline, and (on wide screens) the live controls.
 *
 * The record button and direction pill live here on desktop because they are the
 * two things a user touches constantly; on smaller screens they move into the flow
 * of the page, which is what the reference layouts do.
 */
export function Header({
  store,
  onOpenSettings,
  onOpenSessions,
  onToggleRail,
}: {
  store: AppStore;
  onOpenSettings: () => void;
  onOpenSessions: () => void;
  onToggleRail?: () => void;
}) {
  const { settings } = store;
  const ThemeIcon = settings.theme === 'dark' ? Moon : settings.theme === 'light' ? Sun : Monitor;

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line px-4 py-3.5 md:px-7 lg:px-12 lg:py-4">
      <div className="flex items-center gap-3.5">
        {onToggleRail ? (
          <button
            type="button"
            onClick={onToggleRail}
            className="ln-btn ln-btn-icon ln-btn-ghost lg:hidden"
            aria-label="Sessions"
          >
            <Menu size={16} />
          </button>
        ) : null}
        <Wordmark height={32} />
        <span className="hidden border-l border-line pl-3.5 text-[0.8125rem] text-dim sm:inline">
          live FI ↔ EN notebook
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="ln-chip hidden md:inline-flex" title="Entries in this session">
          {store.stats.total} {store.stats.total === 1 ? 'line' : 'lines'}
        </span>
        <span
          className="ln-chip hidden md:inline-flex"
          title={store.saving ? 'Writing to this browser' : 'Stored in this browser only'}
        >
          {store.saving ? (
            <Loader2 size={11} className="animate-spin" aria-hidden />
          ) : (
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: store.storageFault ? 'var(--ln-danger)' : 'var(--ln-ok)',
              }}
            />
          )}
          {store.storageFault ? 'Not saving' : store.savedAt ? 'Saved' : 'Ready'}
        </span>

        <button
          type="button"
          onClick={onOpenSessions}
          className="ln-btn ln-btn-ghost ln-btn-icon"
          aria-label="Sessions and saved notebooks"
          title="Sessions"
        >
          <Library size={16} />
        </button>
        <button
          type="button"
          onClick={() => store.updateSettings({ theme: themeNext(settings.theme) })}
          className="ln-btn ln-btn-ghost ln-btn-icon"
          aria-label={`Theme: ${settings.theme}. Switch to ${themeNext(settings.theme)}.`}
          title={`Theme: ${settings.theme}`}
        >
          <ThemeIcon size={16} />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="ln-btn ln-btn-ghost ln-btn-icon"
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
