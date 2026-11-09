import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Download, FileCode2, FileText } from 'lucide-react';
import type { AppStore } from '../hooks/useAppStore';
import { buildExport, downloadFile } from '../lib/export';

export function ExportMenu({ store }: { store: AppStore }) {
  const { session, entries, settings, pushToast } = store;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const disabled = !session;

  const doExport = (format: 'md' | 'txt') => {
    setOpen(false);
    if (!session) return;
    if (entries.length === 0) {
      pushToast({
        tone: 'info',
        title: 'Nothing to export yet',
        detail: 'Add a sentence first — the file would be empty.',
      });
    }
    const { content, filename, mime } = buildExport(session, entries, settings, format);
    downloadFile(content, filename, mime);
    pushToast({ tone: 'success', title: `Exported ${format.toUpperCase()}`, detail: filename });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="ln-btn ln-btn-ghost h-8 gap-1.5 text-[0.75rem]"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Export this conversation"
      >
        <Download size={12} aria-hidden />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown size={11} className="opacity-60" aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-56 animate-fade-up overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-xl"
          role="menu"
        >
          <MenuItem
            icon={<FileText size={13} aria-hidden />}
            title="Markdown (.md)"
            hint="Readable headings, great for Notion"
            onClick={() => doExport('md')}
          />
          <MenuItem
            icon={<FileCode2 size={13} aria-hidden />}
            title="Plain text (.txt)"
            hint="Simple, opens anywhere"
            onClick={() => doExport('txt')}
          />
          <div className="mt-1 border-t border-line px-2 pb-1 pt-1.5">
            <p className="text-[0.625rem] leading-relaxed text-muted">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
              {settings.exportIncludeTranslation ? 'with translations' : 'originals only'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-panel-2"
    >
      <span className="mt-0.5 text-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-medium text-ink">{title}</span>
        <span className="block text-[0.6875rem] text-muted">{hint}</span>
      </span>
    </button>
  );
}