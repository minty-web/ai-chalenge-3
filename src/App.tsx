import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Mic, WifiOff, X } from 'lucide-react';
import { useAppStore } from './hooks/useAppStore';
import { useSpeech } from './hooks/useSpeech';
import { Header } from './components/Header';
import { DirectionSwitch } from './components/DirectionSwitch';
import { RecorderBar } from './components/RecorderBar';
import { Notebook } from './components/Notebook';
import { ManualInput } from './components/ManualInput';
import { SessionDrawer } from './components/SessionDrawer';
import { SettingsDialog } from './components/SettingsDialog';
import { ExportMenu } from './components/ExportMenu';
import { Toasts } from './components/Toasts';
import { ConfirmDialog } from './components/ConfirmDialog';
import { langsOf } from './types';
import { resolveLocale } from './lib/speech';
import { resetSettings } from './lib/settings';

export default function App() {
  const store = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [adding, setAdding] = useState(false);

  const { source, target } = langsOf(store.direction);

  const speech = useSpeech({
    lang: source,
    override: store.settings.recognitionLang,
    onSentence: (sentence) => {
      void store.addEntry(sentence, 'speech');
    },
    onInterim: (text) => store.setInterim(text),
    onNotice: (title, detail, tone) => store.pushToast({ tone, title, detail }),
    setRecorder: store.setRecorder,
    setMic: store.setMic,
    setStartedAt: store.setRecordingStartedAt,
  });

  // Keep the recogniser locale in sync with the direction / settings.
  useEffect(() => {
    speech.setLocale(source, store.settings.recognitionLang);
  }, [source, store.settings.recognitionLang, speech]);

  const handleStart = useCallback(async () => {
    if (!store.session) {
      store.pushToast({
        tone: 'error',
        title: 'No open session',
        detail: 'Create a session before recording.',
      });
      return;
    }
    await speech.start();
  }, [speech, store]);

  const handleStop = useCallback(async () => {
    await speech.stop();
  }, [speech]);

  // Space bar toggles recording, Escape stops it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing || settingsOpen || confirmClear || confirmReset) return;
      if (e.code === 'Space' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (store.recorder === 'listening' || store.recorder === 'starting') void handleStop();
        else void handleStart();
      }
      if (e.key === 'Escape' && (store.recorder === 'listening' || store.recorder === 'starting')) {
        e.preventDefault();
        void handleStop();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleStart, handleStop, settingsOpen, confirmClear, confirmReset, store.recorder]);

  // Stop recognition when the tab is hidden for a long time (browsers kill it anyway).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && speech.support.supported) {
        // Recognisers stop themselves; nothing to do but let onend fire.
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [speech.support.supported]);

  const submitManual = useCallback(
    async (text: string) => {
      setAdding(true);
      try {
        await store.addEntry(text, 'manual');
      } finally {
        setAdding(false);
      }
    },
    [store],
  );

  const copyToClipboard = useCallback(
    (text: string) => {
      navigator.clipboard
        ?.writeText(text)
        .then(() => store.pushToast({ tone: 'success', title: 'Copied to clipboard' }))
        .catch(() =>
          store.pushToast({
            tone: 'warning',
            title: 'Copy blocked',
            detail: 'Your browser did not allow clipboard access.',
          }),
        );
    },
    [store],
  );

  const directionLocked = store.recorder === 'listening' || store.recorder === 'starting';

  return (
    <div className="flex h-full flex-col bg-bg">
      <Header
        store={store}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
        sidebarOpen={sidebarOpen}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 overflow-hidden">
        {/* Sidebar is fixed on small screens; the layout spacer shows on lg. */}
        <div className="hidden w-[19rem] shrink-0 lg:block">
          <SessionDrawer store={store} open onClose={() => undefined} />
        </div>
        <div className="lg:hidden">
          <SessionDrawer store={store} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>

        <main className="flex min-w-0 flex-1 flex-col border-l-0 border-line lg:border-l">
          {/* Toolbar */}
          <div className="shrink-0 border-b border-line bg-bg px-3 py-2.5 sm:px-4">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
              <DirectionSwitch
                value={store.direction}
                onChange={(d) => void store.setDirection(d)}
                disabled={directionLocked}
              />
              {directionLocked ? (
                <span className="text-[0.6875rem] text-muted">Stop recording to switch direction</span>
              ) : null}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="ln-chip hidden sm:inline-flex" title="Entries in this session">
                  {store.stats.total} {store.stats.total === 1 ? 'entry' : 'entries'}
                  {store.stats.failed > 0 ? (
                    <span style={{ color: 'var(--ln-danger)' }}>· {store.stats.failed} failed</span>
                  ) : null}
                </span>
                <ExportMenu store={store} />
              </div>
            </div>
          </div>

          {/* Recorder */}
          <div className="shrink-0 px-3 pt-3 sm:px-4">
            <div className="mx-auto max-w-3xl space-y-2">
              <RecorderBar
                state={store.recorder}
                mic={store.mic}
                startedAt={store.recordingStartedAt}
                interim={store.interim}
                supported={speech.support.supported}
                supportReason={speech.support.reason}
                localeLabel={resolveLocale(source, store.settings.recognitionLang)}
                onStart={() => void handleStart()}
                onStop={() => void handleStop()}
              />
              {store.storageFault ? (
                <Banner
                  tone="error"
                  icon={<AlertTriangle size={13} aria-hidden />}
                  title="Local storage problem"
                  body={`${store.storageFault} Export your notebook before closing this tab.`}
                />
              ) : null}
              {!store.online ? (
                <Banner
                  tone="warning"
                  icon={<WifiOff size={13} aria-hidden />}
                  title="You are offline"
                  body="Sentences are still transcribed and saved. Translations will retry when the connection returns — or use the Retry button on a failed entry."
                />
              ) : null}
              {!store.settings.autoTranslate ? (
                <Banner
                  tone="info"
                  icon={<Mic size={13} aria-hidden />}
                  title="Automatic translation is off"
                  body="New sentences are saved as originals. Use Re-translate on any entry, or turn automatic translation back on in Settings."
                />
              ) : null}
            </div>
          </div>

          {/* Notebook */}
          <div className="flex min-h-0 flex-1 flex-col pt-2">
            <Notebook
              entries={store.entries}
              interim={store.interim}
              showInterim={store.settings.showInterim}
              autoScroll={store.settings.autoScroll}
              sourceLang={source}
              targetLang={target}
              listening={store.recorder === 'listening'}
              booting={store.booting}
              onRetry={store.retryTranslation}
              onEdit={store.editEntry}
              onDelete={store.removeEntry}
              onCopy={copyToClipboard}
            />
          </div>

          <ManualInput
            sourceLang={source}
            targetLang={target}
            onSubmit={submitManual}
            busy={adding}
            disabled={!store.session}
          />
        </main>
      </div>

      <SettingsDialog
        store={store}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRequestClearSession={() => {
          setSettingsOpen(false);
          setConfirmClear(true);
        }}
        onRequestResetSettings={() => {
          setSettingsOpen(false);
          setConfirmReset(true);
        }}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear this session?"
        body={`All ${store.stats.total} ${store.stats.total === 1 ? 'entry' : 'entries'} in “${store.session?.title ?? 'this session'}” will be deleted from this browser. The session itself stays. Export first if you want to keep a copy.`}
        confirmLabel="Clear notebook"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void store.clearCurrentSession();
        }}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Reset all settings?"
        body="Theme, engine, direction and export preferences return to their defaults. Your conversations are not touched."
        confirmLabel="Reset settings"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetSettings();
          store.pushToast({ tone: 'success', title: 'Settings reset' });
        }}
      />

      <Toasts toasts={store.toasts} onDismiss={store.dismissToast} />
    </div>
  );
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: 'error' | 'warning' | 'info';
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const color =
    tone === 'error' ? 'var(--ln-danger)' : tone === 'warning' ? 'var(--ln-warn)' : 'var(--ln-accent)';
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[0.75rem] leading-relaxed"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`,
      }}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className="mt-0.5 shrink-0" style={{ color }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold" style={{ color }}>
          {title}
        </p>
        <p className="mt-0.5 text-muted">{body}</p>
      </div>
      {tone !== 'error' ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-0.5 text-muted hover:text-ink"
          aria-label="Dismiss"
        >
          <X size={11} />
        </button>
      ) : null}
    </div>
  );
}