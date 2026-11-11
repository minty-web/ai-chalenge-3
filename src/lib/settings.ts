import { DEFAULT_SETTINGS, type Lang, type Settings } from '../types';

const KEY = 'chattersnap:settings';
/** Remembers the language last being listened for between reloads. */
const LANG_KEY = 'chattersnap:last-lang';

type Listener = (settings: Settings) => void;
const listeners = new Set<Listener>();

function sanitize(raw: unknown): Settings {
  const input = (raw ?? {}) as Partial<Settings>;
  const merged: Settings = { ...DEFAULT_SETTINGS, ...input };
  if (!['light', 'dark', 'system'].includes(merged.theme)) merged.theme = DEFAULT_SETTINGS.theme;
  if (!['auto', 'fi-en', 'en-fi'].includes(merged.defaultDirection)) {
    merged.defaultDirection = DEFAULT_SETTINGS.defaultDirection;
  }
  if (!['auto', 'fi-FI', 'en-US', 'en-GB'].includes(merged.recognitionLang)) {
    merged.recognitionLang = DEFAULT_SETTINGS.recognitionLang;
  }
  if (!['auto', 'google', 'mymemory', 'libre', 'offline'].includes(merged.provider)) {
    merged.provider = DEFAULT_SETTINGS.provider;
  }
  if (!['md', 'txt'].includes(merged.exportFormat)) merged.exportFormat = DEFAULT_SETTINGS.exportFormat;
  if (!['browser', 'local'].includes(merged.asrEngine)) merged.asrEngine = DEFAULT_SETTINGS.asrEngine;
  if (!['tiny', 'base'].includes(merged.asrModel)) merged.asrModel = DEFAULT_SETTINGS.asrModel;
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

// ---- listening language ------------------------------------------------------

let lastLang: Lang = 'fi';

if (typeof localStorage !== 'undefined') {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'fi' || stored === 'en') lastLang = stored;
  } catch {
    // Ignore: the in-memory default is fine.
  }
}

/** Which language the recogniser should start in. Auto mode moves on from here. */
export function getLastLang(): Lang {
  return lastLang;
}

export function setLastLang(lang: Lang): void {
  lastLang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Not fatal — only a starting hint.
  }
}
