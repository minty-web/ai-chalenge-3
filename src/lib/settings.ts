import { DEFAULT_SETTINGS, type Settings } from '../types';

const KEY = 'chattersnap:settings';

type Listener = (settings: Settings) => void;
const listeners = new Set<Listener>();

function sanitize(raw: unknown): Settings {
  const input = (raw ?? {}) as Partial<Settings>;
  const merged: Settings = { ...DEFAULT_SETTINGS, ...input };
  if (!['light', 'dark', 'system'].includes(merged.theme)) merged.theme = DEFAULT_SETTINGS.theme;
  if (!['fi-en', 'en-fi'].includes(merged.defaultDirection)) {
    merged.defaultDirection = DEFAULT_SETTINGS.defaultDirection;
  }
  if (!['auto', 'fi-FI', 'en-US', 'en-GB'].includes(merged.recognitionLang)) {
    merged.recognitionLang = DEFAULT_SETTINGS.recognitionLang;
  }
  if (!['auto', 'google', 'mymemory', 'libre', 'offline'].includes(merged.provider)) {
    merged.provider = DEFAULT_SETTINGS.provider;
  }
  if (!['md', 'txt'].includes(merged.exportFormat)) merged.exportFormat = DEFAULT_SETTINGS.exportFormat;
  merged.autoTranslate = Boolean(merged.autoTranslate);
  merged.autoScroll = Boolean(merged.autoScroll);
  merged.useProxyCredentials = Boolean(merged.useProxyCredentials);
  merged.exportIncludeTranslation = Boolean(merged.exportIncludeTranslation);
  merged.exportIncludeTimestamps = Boolean(merged.exportIncludeTimestamps);
  merged.showInterim = Boolean(merged.showInterim);
  if (typeof merged.libreEndpoint !== 'string' || !merged.libreEndpoint.trim()) {
    merged.libreEndpoint = DEFAULT_SETTINGS.libreEndpoint;
  }
  return merged;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('linguanote:settings');
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current: Settings = typeof localStorage === 'undefined' ? { ...DEFAULT_SETTINGS } : loadSettings();

export function getSettings(): Settings {
  return current;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  current = sanitize({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode / quota — the app still works for this page view.
  }
  for (const l of listeners) l(current);
  return current;
}

export function subscribeSettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetSettings(): Settings {
  return saveSettings({ ...DEFAULT_SETTINGS });
}