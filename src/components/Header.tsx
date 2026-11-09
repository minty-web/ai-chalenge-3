import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Loader2,
  Menu,
  Monitor,
  Moon,
  Pencil,
  Settings as SettingsIcon,
  Sun,
} from 'lucide-react';
import type { AppStore } from '../hooks/useAppStore';
import type { ThemeMode } from '../types';
import { Logo } from './Logo';

const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'system'];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const;

interface Props {
  store: AppStore;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  sidebarOpen: boolean;
}

export function Header({ store, onToggleSidebar, onOpenSettings, sidebarOpen }: Props) {
  const { session, settings, updateSettings, renameSession, saving, savedAt, online } = store;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="ln-btn ln-btn-ghost ln-btn-icon lg:hidden"
          aria-label={sidebarOpen ? 'Close session list' : 'Open session list'}
          aria-expanded={sidebarOpen}
        >
          <Menu size={16} />
        </button>

        <div className="flex select-none items-center gap-2">
          <Logo size={28} className="shrink-0 rounded-lg" />
          <span className="text-[0.9375rem] font-semibold tracking-tight text-ink">
            Chatter<span style={{ color: 'var(--ln-brand-2)' }}>Snap</span>
          </span>
          <span className="hidden text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted sm:inline">
            FI ↔ EN
          </span>
        </div>

        <div className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />

        <div className="min-w-0 flex-1">
          <SessionTitle
            title={session?.title ?? 'No session'}
            onRename={(next) => void renameSession(next)}
          />
        </div>

        <div
          className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 md:flex"
          title={savedAt ? `Last saved ${new Date(savedAt).toLocaleTimeString()}` : 'Nothing saved yet'}
          aria-live="polite"
        >
          {saving ? (
            <Loader2 size={11} className="animate-spin text-muted" aria-hidden />
          ) : (
            <Check size={11} style={{ color: 'var(--ln-ok)' }} aria-hidden />
          )}
          <span className="text-[0.6875rem] font-medium text-muted">
            {saving ? 'Saving…' : savedAt ? 'Saved locally' : 'Not saved yet'}
          </span>
        </div>

        <span
          className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 sm:flex"
          title={
            online
              ? 'Internet reachable — online translation available'
              : 'Offline — entries still save on this device'
          }
        >
          {online ? (
            <Cloud size={11} style={{ color: 'var(--ln-ok)' }} aria-hidden />
          ) : (
            <CloudOff size={11} style={{ color: 'var(--ln-warn)' }} aria-hidden />
          )}
          <span className="text-[0.6875rem] font-medium text-muted">{online ? 'Online' : 'Offline'}</span>
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = THEME_ORDER[(THEME_ORDER.indexOf(settings.theme) + 1) % THEME_ORDER.length];
              updateSettings({ theme: next });
            }}
            className="ln-btn ln-btn-ghost ln-btn-icon"
            title={`Theme: ${THEME_LABEL[settings.theme]} — click to change`}
            aria-label={`Theme: ${THEME_LABEL[settings.theme]}. Change theme`}
          >
            {(() => {
              const Icon = THEME_ICON[settings.theme];
              return <Icon size={15} />;
            })()}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="ln-btn ln-btn-ghost ln-btn-icon"
            title="Settings"
            aria-label="Open settings"
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}

function SessionTitle({ title, onRename }: { title: string; onRename: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    else setDraft(title);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(title);
            setEditing(false);
          }
        }}
        maxLength={80}
        className="ln-input h-8 max-w-xs py-1 text-[0.8125rem] font-medium"
        aria-label="Session name"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-panel-2"
      title="Rename this session"
    >
      <span className="truncate text-[0.8125rem] font-medium text-ink">{title}</span>
      <Pencil
        size={11}
        className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}