import { useCallback, useEffect, useState } from 'react';
import { CloudOff, Loader2, Mic, TriangleAlert, X } from 'lucide-react';
import { useAppStore } from './hooks/useAppStore';
import { useSpeech } from './hooks/useSpeech';
import { Header } from './components/Header';
import { DirectionPill } from './components/DirectionPill';
import { RecordButton, RecordStatus, RecordingTimer } from './components/Controls';
import { Notebook } from './components/Notebook';
import { SideRail } from './components/SideRail';
import { ManualInput } from './components/ManualInput';
import { SessionsPanel } from './components/SessionsPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { MicTestDialog } from './components/MicTestDialog';
import { Toasts } from './components/Toasts';
import { downloadFile } from './lib/export';
import { formatClockSeconds } from './lib/util';
import { LANG_CODE, otherLang } from './types';

export default function App() {
  const store = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [micTestOpen, setMicTestOpen] = useState(false);

  const speech = useSpeech({
    startLang: store.liveLang,
    direction: store.direction,
    localePref: store.settings.recognitionLang,
    engine: store.settings.asrEngine,
    model: store.settings.asrModel,
    onSentence: (text, lang, detected) => {
      void store.addEntry(text, 'speech', lang, detected);
    },
    onInterim: (text, lang) => store.setInterim(text.trim() ? { text, lang } : null),
    onLanguageChange: store.setLiveLang,
    onNotice: (title, detail, tone) =>
      store.pushToast({ title, detail, tone: tone === 'error' ? 'error' : tone }),
    setRecorder: store.setRecorder,
    setMic: store.setMic,
    setStartedAt: store.setRecordingStartedAt,
  });

  const listening = store.recorder === 'listening' || store.recorder === 'starting';

  const toggleRecording = useCallback(() => {
    if (listening) void speech.stop();
    else void speech.start();
  }, [listening, speech]);

  const anyDialogOpen = settingsOpen || sessionsOpen || confirmClear || confirmReset || micTestOpen;

  // Space starts and stops; Esc stops. Both stay out of the way while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing || anyDialogOpen) return;
      if (e.key === ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleRecording();
      } else if (e.key === 'Escape' && listening) {
        e.preventDefault();
        void speech.stop();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleRecording, listening, speech, anyDialogOpen]);

  const doExport = useCallback(
    (format: 'md' | 'txt') => {
      if (!store.session) return;
      if (store.entries.length === 0) {
        store.pushToast({
          tone: 'info',
          title: 'Nothing to export yet',
          detail: 'Add a line first — the file would be empty.',
        });
        return;
      }
      const built = store.buildCurrentExport(format);
      downloadFile(built.content, built.filename, built.mime);
      store.pushToast({ tone: 'success', title: `Exported ${format.toUpperCase()}`, detail: built.filename });
    },
    [store],
  );

  /**
   * Auto mode has nothing to invert — the app already translates both ways — so
   * the swap button moves the starting language of the recogniser instead.
   */
  const swapDirection = useCallback(() => {
    if (store.direction === 'auto') store.setLiveLang(otherLang(store.liveLang));
    else void store.setDirection(store.direction === 'fi-en' ? 'en-fi' : 'fi-en');
  }, [store]);

  const dismiss = (id: string) => setDismissed((prev) => [...prev, id]);
  const showBanner = (id: string) => !dismissed.includes(id);

  const pill = (stretch: boolean) => (
    <DirectionPill
      direction={store.direction}
      liveLang={store.liveLang}
      onSwap={swapDirection}
      onPin={(lang) => void store.setDirection(lang === 'fi' ? 'fi-en' : 'en-fi')}
      onAuto={() => void store.setDirection('auto')}
      disabled={listening}
      stretch={stretch}
    />
  );

  const micTestButton = (withLabel: boolean) => (
    <button
      type="button"
      onClick={() => setMicTestOpen(true)}
      className={
        withLabel
          ? 'ln-btn ln-btn-ghost h-8 gap-1.5 px-2.5 text-[0.75rem]'
          : 'ln-btn ln-btn-ghost ln-btn-icon'
      }
      aria-label="Test the microphone"
      title="Test the microphone"
    >
      <Mic size={withLabel ? 13 : 15} />
      {withLabel ? 'Test mic' : null}
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      <Header
        store={store}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSessions={() => setSessionsOpen(true)}
      />

      {/* Desktop: everything sits on one control line under the header. */}
      <div className="hidden border-b border-line px-12 py-3 lg:block">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4">
          {pill(false)}
          <RecordStatus state={store.recorder} liveLang={store.liveLang} engine={store.settings.asrEngine} />
          <RecordButton state={store.recorder} onToggle={toggleRecording} />
          {micTestButton(false)}
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-3 md:px-7 md:pt-5 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-12 lg:pb-8 lg:pt-8">
          <div className="hidden lg:block">
            <SideRail store={store} onExport={doExport} onOpenSessions={() => setSessionsOpen(true)} />
          </div>

          <div className="min-w-0">
            {/* Phone: a full-width pair with the status underneath. */}
            <div className="mb-3 md:hidden">
              {pill(true)}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <RecordStatus state={store.recorder} liveLang={store.liveLang} engine={store.settings.asrEngine} />
                {micTestButton(true)}
              </div>
            </div>

            {/* Tablet: the same controls, centred, as a bar above the feed. */}
            <div className="mb-4 hidden flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-line pb-4 md:flex lg:hidden">
              {pill(false)}
              <RecordStatus state={store.recorder} liveLang={store.liveLang} engine={store.settings.asrEngine} />
              <RecordButton state={store.recorder} onToggle={toggleRecording} />
              {micTestButton(false)}
            </div>

            {showBanner('model') &&
            speech.modelProgress &&
            speech.modelProgress.status !== 'ready' &&
            store.settings.asrEngine === 'local' ? (
              <Banner
                tone={speech.modelProgress.status === 'error' ? 'danger' : 'info'}
                icon={
                  speech.modelProgress.status === 'error' ? (
                    <TriangleAlert size={13} aria-hidden />
                  ) : (
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                  )
                }
                title={
                  speech.modelProgress.status === 'error'
                    ? 'The on-device model did not load'
                    : 'Downloading the on-device model'
                }
                body={
                  speech.modelProgress.status === 'error'
                    ? `${speech.modelProgress.detail} You can switch back to the browser engine in settings, or keep typing — nothing is lost.`
                    : `${speech.modelProgress.detail} This happens once; afterwards it runs offline and no audio leaves this device.`
                }
                onDismiss={() => dismiss('model')}
              />
            ) : null}

            {showBanner('storage') && store.storageFault ? (
              <Banner
                tone="danger"
                icon={<TriangleAlert size={13} aria-hidden />}
                title="This browser is not saving"
                body={store.storageFault}
                onDismiss={() => dismiss('storage')}
              />
            ) : null}
            {showBanner('offline') && !store.online ? (
              <Banner
                tone="warning"
                icon={<CloudOff size={13} aria-hidden />}
                title="You are offline"
                body="Speech and translation need a connection. Typed lines are still saved on this device."
                onDismiss={() => dismiss('offline')}
              />
            ) : null}
            {showBanner('autotranslate') && !store.settings.autoTranslate ? (
              <Banner
                tone="info"
                icon={<Loader2 size={13} aria-hidden />}
                title="Auto-translate is off"
                body="New lines are saved untranslated. Use Re-translate on any line when you want it."
                onDismiss={() => dismiss('autotranslate')}
              />
            ) : null}
            {showBanner('unsupported') &&
            store.settings.asrEngine === 'browser' &&
            !speech.support.supported ? (
              <Banner
                tone="warning"
                icon={<TriangleAlert size={13} aria-hidden />}
                title="No speech recognition in this browser"
                body={`${speech.support.reason ?? 'The Web Speech API is unavailable here.'} Typing works exactly the same — every line is still translated and saved.`}
                onDismiss={() => dismiss('unsupported')}
              />
            ) : null}

            <Notebook
              entries={store.entries}
              interim={store.interim}
              showInterim={store.settings.showInterim}
              autoScroll={store.settings.autoScroll}
              listening={store.recorder === 'listening'}
              booting={store.booting}
              onRetry={store.retryTranslation}
              onEdit={store.editEntry}
              onDelete={store.removeEntry}
              onSwapLanguage={store.swapEntryLanguage}
              onCopy={(text) => {
                void navigator.clipboard
                  ?.writeText(text)
                  .then(() =>
                    store.pushToast({ tone: 'success', title: 'Copied', detail: 'Original and translation.' }),
                  )
                  .catch(() =>
                    store.pushToast({ tone: 'error', title: 'Could not copy', detail: 'Clipboard blocked.' }),
                  );
              }}
            />

            <ManualInput
              onSubmit={async (text) => {
                await store.addEntry(text, 'manual');
              }}
              busy={store.saving}
              disabled={store.booting}
            />
            <div className="mt-4 hidden flex-wrap items-center justify-center gap-2 md:flex lg:hidden">
              <span className="ln-stat" style={{ color: 'var(--ln-muted)' }}>
                <RecordingTimer
                  startedAt={store.recordingStartedAt}
                  recording={listening}
                  fallbackMs={
                    store.session ? Math.max(0, store.session.updatedAt - store.session.createdAt) : 0
                  }
                />
                <span aria-hidden>·</span>
                {store.entries.length} {store.entries.length === 1 ? 'line' : 'lines'}
              </span>
              <span className="ln-stat" style={{ color: 'var(--ln-muted)' }}>
                {store.storageFault ? 'Not saving' : store.savedAt ? `Saved ${formatClockSeconds(store.savedAt)}` : 'Ready'}
              </span>
              <button type="button" className="ln-stat" onClick={() => doExport('txt')}>
                Export .txt
              </button>
              <button type="button" className="ln-stat" onClick={() => doExport('md')}>
                Export .md
              </button>
              <button
                type="button"
                className="w-full py-1 text-center text-[0.8125rem]"
                style={{ color: 'var(--ln-brand-2)' }}
                onClick={() => setSessionsOpen(true)}
              >
                View saved notebooks →
              </button>
            </div>
          </div>
        </div>
      </main>

      {/*
        Phone: the record button lives in a fixed bar at the bottom of the viewport.
        On a long conversation the feed scrolls, and a Start button that has scrolled
        out of reach is useless — this keeps it under the thumb at all times.
      */}
      <div
        className="shrink-0 border-t border-line px-4 pb-3 pt-3 md:hidden"
        style={{ backgroundColor: 'var(--ln-bg)' }}
      >
        <p className="mb-2 text-center text-[0.6875rem]" style={{ color: 'var(--ln-faint)' }}>
          <RecordingTimer
            startedAt={store.recordingStartedAt}
            recording={listening}
            fallbackMs={
              store.session ? Math.max(0, store.session.updatedAt - store.session.createdAt) : 0
            }
            className="tabular-nums"
          />
          {' · '}
          {store.entries.length} {store.entries.length === 1 ? 'line' : 'lines'}
          {' · '}
          {store.storageFault ? 'not saving' : store.savedAt ? `saved ${formatClockSeconds(store.savedAt)}` : 'ready'}
          {' · '}
          {LANG_CODE[store.liveLang]} in
          {' · '}
          <button
            type="button"
            onClick={() => setSessionsOpen(true)}
            style={{ color: 'var(--ln-brand-2)' }}
            className="underline-offset-2 hover:underline"
          >
            notebooks
          </button>
        </p>
        <RecordButton state={store.recorder} onToggle={toggleRecording} full />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => doExport('txt')}
            className="rounded-lg border border-line px-3 py-2 text-[0.75rem] font-medium"
            style={{ backgroundColor: 'var(--ln-panel)' }}
          >
            Export .txt
          </button>
          <button
            type="button"
            onClick={() => doExport('md')}
            className="rounded-lg border border-line px-3 py-2 text-[0.75rem] font-medium"
            style={{ backgroundColor: 'var(--ln-panel)' }}
          >
            Export .md
          </button>
        </div>
      </div>

      <SessionsPanel store={store} open={sessionsOpen} onClose={() => setSessionsOpen(false)} />
      <SettingsDialog
        store={store}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onRequestClearSession={() => setConfirmClear(true)}
        onRequestResetSettings={() => setConfirmReset(true)}
      />

      <MicTestDialog
        open={micTestOpen}
        onClose={() => setMicTestOpen(false)}
        lang={store.liveLang}
        localePref={store.settings.recognitionLang}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear this notebook?"
        body={`All ${store.entries.length} lines are deleted from this browser. The session itself stays. Export first if you want a copy — this cannot be undone.`}
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
        title="Reset settings?"
        body="Theme, listening mode, engine and export options go back to their defaults. Your notebooks and saved lines are untouched."
        confirmLabel="Reset settings"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          store.updateSettings({
            theme: 'system',
            defaultDirection: 'auto',
            recognitionLang: 'auto',
            autoTranslate: true,
            autoScroll: true,
            provider: 'auto',
            useProxyCredentials: false,
            exportFormat: 'md',
            exportIncludeTranslation: true,
            exportIncludeTimestamps: true,
            showInterim: true,
          });
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
  onDismiss,
}: {
  tone: 'info' | 'warning' | 'danger';
  icon: React.ReactNode;
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  const color =
    tone === 'danger' ? 'var(--ln-danger)' : tone === 'warning' ? 'var(--ln-warn)' : 'var(--ln-accent)';
  return (
    <div
      className="mb-3 flex items-start gap-2.5 rounded-lg px-3 py-2.5"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
      role="status"
    >
      <span className="mt-0.5 shrink-0" style={{ color }} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-semibold" style={{ color }}>
          {title}
        </p>
        <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">{body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="-m-1 shrink-0 rounded p-1 text-muted"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
