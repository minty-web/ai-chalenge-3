import { useEffect, useState, type ReactNode } from 'react';
import {
  Check,
  Database,
  Download,
  FileText,
  Loader2,
  Plug,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { AppStore } from '../hooks/useAppStore';
import type { Direction, ProviderId, Settings, ThemeMode } from '../types';
import { DIRECTIONS, DIRECTION_ORDER } from '../types';
import { ALL_PROVIDERS } from '../lib/translate/providers';
import { testProvider } from '../lib/translate';
import { storageStatus } from '../lib/db';
import { downloadFile } from '../lib/export';
import { localWhisperReady, preloadLocalModel } from '../lib/localWhisper';

const PROVIDER_OPTIONS: { id: ProviderId; label: string; detail: string }[] = [
  {
    id: 'auto',
    label: 'Automatic (recommended)',
    detail: 'Google, then MyMemory, then LibreTranslate, and only if all of them fail the offline phrasebook.',
  },
  { id: 'google', label: 'Google Translate', detail: 'Free public endpoint. Fastest and best Finnish quality.' },
  { id: 'mymemory', label: 'MyMemory', detail: 'Free translation memory with a daily character quota.' },
  {
    id: 'libre',
    label: 'LibreTranslate',
    detail: 'Open-source engine. Point it at your own instance; API keys stay on the server.',
  },
  {
    id: 'offline',
    label: 'Offline phrasebook only',
    detail: 'No network at all. Small vocabulary, and every such line is marked in the notebook.',
  },
];

export function SettingsDialog({
  store,
  open,
  onClose,
  onRequestClearSession,
  onRequestResetSettings,
}: {
  store: AppStore;
  open: boolean;
  onClose: () => void;
  onRequestClearSession: () => void;
  onRequestResetSettings: () => void;
}) {
  const { settings, updateSettings, pushToast, session, setDirection } = store;
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [storage, setStorage] = useState<{ available: boolean; usage: string | null } | null>(null);
  /** Download state for the on-device model, when that engine is selected. */
  const [model, setModel] = useState<{ percent: number; detail: string; failed: boolean } | null>(null);

  /**
   * Fetching the model is slow and boring, so it starts as soon as the engine is
   * chosen rather than when the user finally presses Start. If it fails, the error
   * is shown here instead of as a surprise mid-conversation.
   */
  useEffect(() => {
    if (!open || settings.asrEngine !== 'local') {
      setModel(null);
      return;
    }
    if (localWhisperReady()) {
      setModel({ percent: 100, detail: 'Ready — cached in this browser.', failed: false });
      return;
    }
    let cancelled = false;
    void preloadLocalModel(settings.asrModel, (progress) => {
      if (!cancelled) {
        setModel({ percent: progress.percent, detail: progress.detail, failed: progress.status === 'error' });
      }
    }).catch(() => {
      // The message is already in `progress.detail`; nothing else to do here.
    });
    return () => {
      cancelled = true;
    };
  }, [open, settings.asrEngine, settings.asrModel]);

  useEffect(() => {
    if (!open) return;
    void storageStatus().then(setStorage);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    setTestResult(null);
  }, [settings.provider, settings.libreEndpoint, settings.useProxyCredentials]);

  if (!open) return null;

  const patch = (p: Partial<Settings>) => updateSettings(p);
  const activeDirection = session?.direction ?? settings.defaultDirection;

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const text = await testProvider({
        from: 'fi',
        to: 'en',
        provider: settings.provider,
        libreEndpoint: settings.libreEndpoint,
        useProxyCredentials: settings.useProxyCredentials,
        signal: new AbortController().signal,
        allowOffline: false,
      });
      setTestResult({ ok: true, text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const detail =
        err && typeof err === 'object' && 'detail' in err
          ? String((err as { detail?: string }).detail ?? '')
          : '';
      setTestResult({ ok: false, text: detail || message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-black/45" onClick={onClose} role="presentation">
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
          <h2 id="settings-title" className="ln-display flex-1 text-[0.9375rem] font-semibold text-ink">
            Settings
          </h2>
          <button type="button" onClick={onClose} className="ln-btn ln-btn-ghost ln-btn-icon" aria-label="Close settings">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <Section title="Listening">
            <Field
              label="What the microphone expects"
              hint="Auto is the default. The recogniser follows whichever language you are speaking, and each sentence is translated into the other one."
            >
              <div className="flex flex-col gap-1.5">
                {DIRECTION_ORDER.map((d: Direction) => {
                  const on = activeDirection === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => void setDirection(d)}
                      aria-pressed={on}
                      className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
                      style={{
                        border: `1px solid ${on ? 'var(--ln-accent)' : 'var(--ln-border)'}`,
                        backgroundColor: on ? 'var(--ln-accent-soft)' : 'transparent',
                      }}
                    >
                      <span
                        aria-hidden
                        className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          border: `1px solid ${on ? 'var(--ln-accent)' : 'var(--ln-dim)'}`,
                          backgroundColor: on ? 'var(--ln-accent)' : 'transparent',
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-medium text-ink">
                          {d === 'auto' ? 'Auto-detect both languages' : DIRECTIONS[d].label}
                        </span>
                        <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted">
                          {DIRECTIONS[d].hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field
              label="How speech is recognised"
              hint="The browser engine streams audio to Google or Apple and needs a connection. The on-device model downloads once, then works offline and never sends audio anywhere."
            >
              <div className="flex flex-col gap-1.5">
                {(
                  [
                    {
                      id: 'browser' as const,
                      label: 'Browser engine',
                      detail: 'Instant, no download. Understands Finnish well, but needs a network connection.',
                    },
                    {
                      id: 'local' as const,
                      label: 'On-device model (Whisper)',
                      detail: 'Runs in this tab. Download once, then offline and private.',
                    },
                  ]
                ).map((opt) => {
                  const on = settings.asrEngine === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => patch({ asrEngine: opt.id })}
                      aria-pressed={on}
                      className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors"
                      style={{
                        border: `1px solid ${on ? 'var(--ln-accent)' : 'var(--ln-border)'}`,
                        backgroundColor: on ? 'var(--ln-accent-soft)' : 'transparent',
                      }}
                    >
                      <span
                        aria-hidden
                        className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          border: `1px solid ${on ? 'var(--ln-accent)' : 'var(--ln-dim)'}`,
                          backgroundColor: on ? 'var(--ln-accent)' : 'transparent',
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-medium text-ink">{opt.label}</span>
                        <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted">
                          {opt.detail}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {settings.asrEngine === 'local' ? (
              <Field
                label="Model size"
                hint="The model is cached by the browser after the first download. Tiny is quicker to start; Base is noticeably more accurate with Finnish."
              >
                <select
                  className="ln-input"
                  value={settings.asrModel}
                  onChange={(e) => patch({ asrModel: e.target.value as Settings['asrModel'] })}
                >
                  <option value="tiny">Tiny — about 40 MB</option>
                  <option value="base">Base — about 80 MB</option>
                </select>
                {model ? (
                  <div className="mt-1.5" role="status">
                    <div className="flex items-center gap-2 text-[0.6875rem] leading-relaxed">
                      {model.failed ? null : model.percent < 100 ? (
                        <Loader2 size={10} className="shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <Check size={10} className="shrink-0" aria-hidden />
                      )}
                      <span
                        className="min-w-0"
                        style={{
                          color: model.failed
                            ? 'var(--ln-danger)'
                            : model.percent >= 100
                              ? 'var(--ln-ok)'
                              : 'var(--ln-muted)',
                        }}
                      >
                        {model.detail}
                      </span>
                    </div>
                    {!model.failed && model.percent < 100 ? (
                      <div
                        className="mt-1 h-1 overflow-hidden rounded-full"
                        style={{ backgroundColor: 'var(--ln-panel-2)' }}
                        aria-hidden
                      >
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{ width: `${model.percent}%`, backgroundColor: 'var(--ln-accent)' }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Field>
            ) : (
              <Field label="English locale" hint="Only affects how English is heard; Finnish always uses fi-FI.">
                <select
                  className="ln-input"
                  value={settings.recognitionLang}
                  onChange={(e) => patch({ recognitionLang: e.target.value as Settings['recognitionLang'] })}
                >
                  <option value="auto">Follow the language (fi-FI / en-US)</option>
                  <option value="fi-FI">Finnish (fi-FI)</option>
                  <option value="en-US">English — US (en-US)</option>
                  <option value="en-GB">English — UK (en-GB)</option>
                </select>
              </Field>
            )}

            <Toggle
              label="Scroll to the newest line automatically"
              checked={settings.autoScroll}
              onChange={(v) => patch({ autoScroll: v })}
            />
            <Toggle
              label="Show words while I am still speaking"
              hint="Shown greyed out as live text; never saved."
              checked={settings.showInterim}
              onChange={(v) => patch({ showInterim: v })}
            />
          </Section>

          <Section title="Appearance">
            <Field label="Theme">
              <div className="flex gap-1.5">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patch({ theme: mode })}
                    className="ln-btn flex-1 capitalize"
                    style={
                      settings.theme === mode
                        ? { backgroundColor: 'var(--ln-accent)', color: 'var(--ln-accent-ink)' }
                        : { backgroundColor: 'var(--ln-panel-2)', color: 'var(--ln-text)' }
                    }
                    aria-pressed={settings.theme === mode}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          <Section title="Translation">
            <Toggle
              label="Translate new sentences automatically"
              hint="Off keeps originals only; translate later with Re-translate on any line."
              checked={settings.autoTranslate}
              onChange={(v) => patch({ autoTranslate: v })}
            />
            <Field label="Engine">
              <select
                className="ln-input"
                value={settings.provider}
                onChange={(e) => patch({ provider: e.target.value as ProviderId })}
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">
                {PROVIDER_OPTIONS.find((p) => p.id === settings.provider)?.detail}
              </p>
            </Field>

            <Field
              label="LibreTranslate endpoint"
              hint="Only used when LibreTranslate is selected. API keys come from the local proxy's .env — never from the browser."
            >
              <input
                className="ln-input font-mono text-[0.75rem]"
                value={settings.libreEndpoint}
                onChange={(e) => patch({ libreEndpoint: e.target.value })}
                placeholder="https://libretranslate.example.com/translate"
                spellCheck={false}
                aria-label="LibreTranslate endpoint URL"
              />
            </Field>

            <Toggle
              label="Route LibreTranslate through the local proxy"
              hint="Keeps the key on your machine. Needs `npm start`, not a static build."
              checked={settings.useProxyCredentials}
              onChange={(v) => patch({ useProxyCredentials: v })}
            />

            <div className="flex items-center gap-2">
              <button type="button" onClick={runTest} disabled={testing} className="ln-btn ln-btn-ghost gap-1.5">
                {testing ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Plug size={12} aria-hidden />}
                Test connection
              </button>
            </div>
            {testResult ? (
              <p
                className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[0.75rem] leading-relaxed"
                style={{
                  backgroundColor: testResult.ok
                    ? 'color-mix(in srgb, var(--ln-ok) 12%, transparent)'
                    : 'color-mix(in srgb, var(--ln-danger) 12%, transparent)',
                  color: testResult.ok ? 'var(--ln-ok)' : 'var(--ln-danger)',
                }}
                role="status"
              >
                {testResult.ok ? (
                  <Check size={12} className="mt-0.5 shrink-0" aria-hidden />
                ) : (
                  <X size={12} className="mt-0.5 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 break-words">{testResult.text}</span>
              </p>
            ) : null}

            <details className="rounded-lg border border-line px-2.5 py-2">
              <summary className="cursor-pointer text-[0.75rem] font-medium text-ink">
                Which engines are available?
              </summary>
              <ul className="mt-2 space-y-1.5">
                {ALL_PROVIDERS.map((p) => (
                  <li key={p.id} className="text-[0.6875rem] leading-relaxed text-muted">
                    <span className="font-semibold text-ink">{p.label}</span>
                    {p.real ? '' : ' (fallback — not a real translation)'} — {p.note}
                  </li>
                ))}
              </ul>
            </details>
          </Section>

          <Section title="Export">
            <Field label="Default format">
              <div className="flex gap-1.5">
                {(['md', 'txt'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => patch({ exportFormat: fmt })}
                    className="ln-btn flex-1"
                    style={
                      settings.exportFormat === fmt
                        ? { backgroundColor: 'var(--ln-accent)', color: 'var(--ln-accent-ink)' }
                        : { backgroundColor: 'var(--ln-panel-2)', color: 'var(--ln-text)' }
                    }
                    aria-pressed={settings.exportFormat === fmt}
                  >
                    {fmt === 'md' ? 'Markdown (.md)' : 'Plain text (.txt)'}
                  </button>
                ))}
              </div>
            </Field>
            <Toggle
              label="Include translations in exports"
              checked={settings.exportIncludeTranslation}
              onChange={(v) => patch({ exportIncludeTranslation: v })}
            />
            <Toggle
              label="Include a timestamp for every line"
              checked={settings.exportIncludeTimestamps}
              onChange={(v) => patch({ exportIncludeTimestamps: v })}
            />
          </Section>

          <Section title="Data">
            <div className="flex items-center gap-1.5 text-[0.75rem] text-muted">
              <Database size={12} aria-hidden />
              {storage === null
                ? 'Checking storage…'
                : storage.available
                  ? `IndexedDB ready${storage.usage ? ` · ${storage.usage} used` : ''}`
                  : 'IndexedDB unavailable — lines will not persist'}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="ln-btn ln-btn-ghost gap-1.5 text-[0.75rem]"
                onClick={() => {
                  const built = store.buildCurrentExport();
                  if (!built.content) {
                    pushToast({ tone: 'info', title: 'Nothing to export yet' });
                    return;
                  }
                  downloadFile(built.content, built.filename, built.mime);
                  pushToast({ tone: 'success', title: 'Export saved', detail: built.filename });
                }}
              >
                <Download size={12} aria-hidden /> Export now
              </button>
              <button type="button" className="ln-btn ln-btn-danger gap-1.5 text-[0.75rem]" onClick={onRequestClearSession}>
                <Trash2 size={12} aria-hidden /> Clear notebook
              </button>
              <button type="button" className="ln-btn ln-btn-ghost gap-1.5 text-[0.75rem]" onClick={onRequestResetSettings}>
                <RotateCcw size={12} aria-hidden /> Reset settings
              </button>
            </div>
            <p className="pt-1 text-[0.625rem] leading-relaxed text-muted">
              Settings live in localStorage, conversations in IndexedDB. Clearing browser data removes both.
            </p>
          </Section>

          <Section title="About">
            <p className="text-[0.75rem] leading-relaxed text-muted">
              <span className="font-semibold text-ink">ChatterSnap</span> — a live Finnish ↔ English conversation
              notebook. The browser speech engine streams audio to the browser vendor&apos;s own service; the
              on-device model keeps it in this tab. Translations go to the engine selected above. Conversations never
              leave this device unless you export them.
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[0.6875rem] text-muted">
              <FileText size={10} aria-hidden /> v1.0.0
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="ln-eyebrow mb-2">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <span className="ln-label">{label}</span>
      {children}
      {hint ? <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2.5 py-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="ln-switch mt-0.5"
        data-on={checked}
      >
        <span />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] leading-snug text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}
