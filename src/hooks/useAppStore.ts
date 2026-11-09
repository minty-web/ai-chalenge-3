import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Direction,
  Entry,
  EntryOrigin,
  MicState,
  RecorderState,
  Session,
  Settings,
  ThemeMode,
} from '../types';
import { DIRECTIONS, langsOf } from '../types';
import * as store from '../lib/db';
import { getSettings, saveSettings, subscribeSettings } from '../lib/settings';
import { normalizeForCompare, translateText } from '../lib/translate';
import { buildExport } from '../lib/export';
import { newId } from '../lib/util';

export interface Toast {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

const TITLE_FOR_DIRECTION: Record<Direction, string> = {
  'fi-en': 'Finnish → English notebook',
  'en-fi': 'English → Finnish notebook',
};

function applyTheme(theme: ThemeMode): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0b0f' : '#f6f6f8');
}

export function useAppStore() {
  const [settings, setSettingsState] = useState<Settings>(() => getSettings());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [interim, setInterim] = useState('');
  const [recorder, setRecorder] = useState<RecorderState>('idle');
  const [mic, setMic] = useState<MicState>('unknown');
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [storageFault, setStorageFault] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [online, setOnline] = useState(() => navigator.onLine);

  const aborters = useRef(new Map<string, AbortController>());
  const sessionRef = useRef<Session | null>(null);
  const settingsRef = useRef(settings);
  const entriesRef = useRef(entries);
  sessionRef.current = session;
  settingsRef.current = settings;
  entriesRef.current = entries;

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = newId('t');
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    const ttl = toast.tone === 'error' ? 9000 : toast.tone === 'warning' ? 7000 : 4000;
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- theme -----------------------------------------------------------------
  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.theme]);

  useEffect(() => subscribeSettings((next) => setSettingsState(next)), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState(saveSettings(patch));
  }, []);

  // ---- connectivity ----------------------------------------------------------
  useEffect(() => {
    const on = () => {
      setOnline(true);
      pushToast({ tone: 'success', title: 'Back online', detail: 'Translation works again.' });
    };
    const off = () => {
      setOnline(false);
      pushToast({
        tone: 'warning',
        title: 'You are offline',
        detail: 'Sentences still save on this device; translations will fail until you reconnect.',
      });
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [pushToast]);

  // ---- entry persistence -----------------------------------------------------
  const writeEntry = useCallback((entry: Entry) => {
    void store
      .putEntry(entry)
      .then(() => {
        setSavedAt(Date.now());
        setStorageFault(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setStorageFault(message);
      });
  }, []);

  /** Applies a patch to one entry in state and mirrors it to IndexedDB. */
  const commitEntry = useCallback(
    (entryId: string, patch: Partial<Entry>) => {
      setEntries((prev) => {
        const current = prev.find((e) => e.id === entryId);
        if (!current) return prev;
        const updated: Entry = { ...current, ...patch };
        writeEntry(updated);
        return prev.map((e) => (e.id === entryId ? updated : e));
      });
    },
    [writeEntry],
  );

  // ---- translation -----------------------------------------------------------
  const runTranslation = useCallback(
    async (entryId: string, text: string, from: 'fi' | 'en', to: 'fi' | 'en') => {
      aborters.current.get(entryId)?.abort();
      const controller = new AbortController();
      aborters.current.set(entryId, controller);
      const cfg = settingsRef.current;

      commitEntry(entryId, { status: 'pending', error: null });

      try {
        const result = await translateText(text, {
          from,
          to,
          provider: cfg.provider,
          libreEndpoint: cfg.libreEndpoint,
          useProxyCredentials: cfg.useProxyCredentials,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        commitEntry(entryId, {
          translation: result.text,
          status: 'done',
          error: null,
          provider: result.providerLabel,
          fallback: result.fallback,
        });
        if (result.fallback) {
          pushToast({
            tone: 'warning',
            title: 'Offline phrasebook used',
            detail:
              'Every online engine failed, so the built-in word matcher produced this line. It may be incomplete.',
          });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        const detail =
          err && typeof err === 'object' && 'detail' in err
            ? String((err as { detail?: string }).detail ?? '')
            : '';
        commitEntry(entryId, { status: 'error', error: detail || message });
        pushToast({ tone: 'error', title: 'Translation failed', detail: detail || message });
      } finally {
        if (aborters.current.get(entryId) === controller) aborters.current.delete(entryId);
      }
    },
    [commitEntry, pushToast],
  );

  const retryTranslation = useCallback(
    async (entryId: string) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (!entry) return;
      await runTranslation(entryId, entry.sourceText, entry.sourceLang, entry.targetLang);
    },
    [runTranslation],
  );

  // ---- entries ---------------------------------------------------------------
  const persistEntry = useCallback(
    async (entry: Entry) => {
      setSaving(true);
      try {
        await store.putEntry(entry);
        await store.touchSession(entry.sessionId);
        setSavedAt(Date.now());
        setStorageFault(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStorageFault(message);
        pushToast({
          tone: 'error',
          title: 'Could not save this entry',
          detail: `${message} The text is still on screen — export it before closing the tab.`,
        });
      } finally {
        setSaving(false);
      }
    },
    [pushToast],
  );

  const addEntry = useCallback(
    async (sourceText: string, origin: EntryOrigin): Promise<Entry | null> => {
      const active = sessionRef.current;
      if (!active) {
        pushToast({ tone: 'error', title: 'No open session', detail: 'Create a session first.' });
        return null;
      }
      const text = sourceText.trim();
      if (!text) return null;

      const cfg = settingsRef.current;
      const { source, target } = langsOf(active.direction);

      // Duplicate guard: the same sentence twice within seconds is an engine glitch.
      const duplicate = [...entriesRef.current]
        .slice(-4)
        .reverse()
        .find(
          (e) =>
            e.sessionId === active.id &&
            normalizeForCompare(e.sourceText) === normalizeForCompare(text) &&
            Date.now() - e.createdAt < 15_000,
        );
      if (duplicate) return duplicate;

      const shouldTranslate = cfg.autoTranslate && cfg.provider !== 'offline';
      const entry: Entry = {
        id: newId('n'),
        sessionId: active.id,
        sourceText: text,
        translation: null,
        sourceLang: source,
        targetLang: target,
        status: shouldTranslate ? 'pending' : 'off',
        error: null,
        provider: null,
        fallback: false,
        origin,
        createdAt: Date.now(),
      };

      setEntries((prev) => [...prev, entry]);
      await persistEntry(entry);

      if (shouldTranslate) {
        void runTranslation(entry.id, text, source, target);
      }
      return entry;
    },
    [persistEntry, pushToast, runTranslation],
  );

  const editEntry = useCallback(
    async (entryId: string, sourceText: string) => {
      const entry = entriesRef.current.find((e) => e.id === entryId);
      if (!entry) return;
      const text = sourceText.trim();
      if (!text) return;
      const autoTranslate = settingsRef.current.autoTranslate;
      const updated: Entry = {
        ...entry,
        sourceText: text,
        translation: autoTranslate ? null : entry.translation,
        status: autoTranslate ? 'pending' : 'off',
        error: null,
      };
      setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      await persistEntry(updated);
      if (autoTranslate) {
        void runTranslation(entryId, text, entry.sourceLang, entry.targetLang);
      }
    },
    [persistEntry, runTranslation],
  );

  const removeEntry = useCallback(
    async (entryId: string) => {
      aborters.current.get(entryId)?.abort();
      aborters.current.delete(entryId);
      const entry = entriesRef.current.find((e) => e.id === entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      try {
        await store.deleteEntry(entryId);
        if (entry) await store.touchSession(entry.sessionId);
        setSavedAt(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        pushToast({ tone: 'error', title: 'Could not delete the entry', detail: message });
      }
    },
    [pushToast],
  );

  // ---- sessions --------------------------------------------------------------
  const openSession = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        const found = await store.getSession(id);
        if (!found) {
          pushToast({
            tone: 'error',
            title: 'Session not found',
            detail: 'It may have been deleted in another tab.',
          });
          return;
        }
        const rows = await store.listEntries(id);
        setSession(found);
        setEntries(rows);
        setInterim('');
        setSavedAt(found.updatedAt);
        setStorageFault(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStorageFault(message);
        pushToast({ tone: 'error', title: 'Could not open the session', detail: message });
      } finally {
        setSaving(false);
      }
    },
    [pushToast],
  );

  const createSession = useCallback(
    async (direction: Direction): Promise<Session | null> => {
      const record = store.createSessionRecord(direction, TITLE_FOR_DIRECTION[direction]);
      try {
        await store.putSession(record);
        setSessions(await store.listSessions());
        setSession(record);
        setEntries([]);
        setInterim('');
        setSavedAt(record.updatedAt);
        return record;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStorageFault(message);
        pushToast({ tone: 'error', title: 'Could not create a session', detail: message });
        return null;
      }
    },
    [pushToast],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await store.listSessions();
        if (cancelled) return;
        setSessions(all);
        if (all.length > 0) {
          await openSession(all[0].id);
        } else {
          await createSession(getSettings().defaultDirection);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStorageFault(message);
        pushToast({
          tone: 'error',
          title: 'Local storage is unavailable',
          detail: `${message} — entries cannot be saved in this browser session. Export before closing the tab.`,
        });
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Boot exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDirection = useCallback(
    async (direction: Direction) => {
      const active = sessionRef.current;
      if (!active || active.direction === direction) return;
      const next: Session = { ...active, direction, updatedAt: Date.now() };
      setSession(next);
      try {
        await store.putSession(next);
        setSessions(await store.listSessions());
        setSavedAt(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        pushToast({ tone: 'error', title: 'Could not save the direction', detail: message });
      }
    },
    [pushToast],
  );

  const renameSession = useCallback(
    async (title: string) => {
      const active = sessionRef.current;
      const clean = title.trim();
      if (!active || !clean || clean === active.title) return;
      const next: Session = { ...active, title: clean, updatedAt: Date.now() };
      setSession(next);
      try {
        await store.putSession(next);
        setSessions(await store.listSessions());
        setSavedAt(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        pushToast({ tone: 'error', title: 'Could not rename the session', detail: message });
      }
    },
    [pushToast],
  );

  const clearCurrentSession = useCallback(async () => {
    const active = sessionRef.current;
    if (!active) return;
    for (const c of aborters.current.values()) c.abort();
    aborters.current.clear();
    setEntries([]);
    try {
      await store.clearSessionEntries(active.id);
      await store.touchSession(active.id);
      setSavedAt(Date.now());
      pushToast({
        tone: 'success',
        title: 'Notebook cleared',
        detail: 'The session itself is still here.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast({ tone: 'error', title: 'Could not clear the session', detail: message });
    }
  }, [pushToast]);

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await store.deleteSessionDeep(id);
        const all = await store.listSessions();
        setSessions(all);
        setSavedAt(Date.now());
        if (sessionRef.current?.id === id) {
          if (all.length > 0) {
            await openSession(all[0].id);
          } else {
            await createSession(settingsRef.current.defaultDirection);
          }
        }
        pushToast({ tone: 'success', title: 'Session deleted' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        pushToast({ tone: 'error', title: 'Could not delete the session', detail: message });
      }
    },
    [createSession, openSession, pushToast],
  );

  const startNewSession = useCallback(async () => {
    const direction = sessionRef.current?.direction ?? settingsRef.current.defaultDirection;
    const created = await createSession(direction);
    if (created) {
      pushToast({ tone: 'success', title: 'New session started', detail: created.title });
    }
  }, [createSession, pushToast]);

  useEffect(() => {
    return () => {
      for (const c of aborters.current.values()) c.abort();
      aborters.current.clear();
    };
  }, []);

  const buildCurrentExport = useCallback((format?: 'md' | 'txt') => {
    const active = sessionRef.current;
    if (!active) return { content: '', filename: '', mime: 'text/plain' };
    return buildExport(active, entriesRef.current, settingsRef.current, format);
  }, []);

  const direction = session?.direction ?? settings.defaultDirection;
  const directionInfo = DIRECTIONS[direction];

  const stats = useMemo(() => {
    const done = entries.filter((e) => e.status === 'done').length;
    const failed = entries.filter((e) => e.status === 'error').length;
    return { total: entries.length, done, failed };
  }, [entries]);

  return {
    settings,
    sessions,
    session,
    entries,
    interim,
    recorder,
    mic,
    recordingStartedAt,
    toasts,
    savedAt,
    saving,
    storageFault,
    booting,
    online,
    direction,
    directionInfo,
    stats,
    setInterim,
    setRecorder,
    setMic,
    setRecordingStartedAt,
    updateSettings,
    addEntry,
    editEntry,
    removeEntry,
    retryTranslation,
    setDirection,
    renameSession,
    clearCurrentSession,
    deleteSession,
    startNewSession,
    openSession,
    buildCurrentExport,
    pushToast,
    dismissToast,
  };
}

export type AppStore = ReturnType<typeof useAppStore>;