import type { Entry, Session, Settings } from '../types';
import { DIRECTIONS, LANG_CODE } from '../types';
import { formatClockSeconds, formatDate, formatDateTime } from './util';

export interface ExportOptions {
  includeTranslation: boolean;
  includeTimestamps: boolean;
  /** Provider footnote so an exported file states how it was translated. */
  includeProvider: boolean;
}

function directionLabel(session: Session): string {
  return DIRECTIONS[session.direction].label;
}

function entriesInOrder(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.createdAt - b.createdAt);
}

export function toMarkdown(session: Session, entries: Entry[], opts: ExportOptions): string {
  const lines: string[] = [];
  lines.push('# ChatterSnap Conversation');
  lines.push('');
  lines.push(`**Session:** ${session.title}`);
  lines.push(`**Date:** ${formatDate(session.createdAt)}`);
  lines.push(`**Started:** ${formatDateTime(session.createdAt)}`);
  lines.push(`**Exported:** ${formatDateTime(Date.now())}`);
  lines.push(`**Direction:** ${directionLabel(session)}`);
  lines.push(`**Entries:** ${entries.length}`);
  lines.push('');

  if (entries.length === 0) {
    lines.push('_No entries in this session._');
    lines.push('');
    return lines.join('\n');
  }

  const ordered = entriesInOrder(entries);
  for (const entry of ordered) {
    lines.push('---');
    lines.push('');
    if (opts.includeTimestamps) {
      lines.push(`### [${formatClockSeconds(entry.createdAt)}]`);
    } else {
      lines.push('### ');
    }
    lines.push('');
    lines.push(`**${entry.sourceLang === 'fi' ? 'Finnish' : 'English'}:**`);
    lines.push('');
    lines.push(entry.sourceText);
    lines.push('');
    if (opts.includeTranslation) {
      lines.push(`**${entry.targetLang === 'fi' ? 'Finnish' : 'English'}:**`);
      lines.push('');
      if (entry.translation) {
        lines.push(entry.translation);
      } else if (entry.status === 'error') {
        lines.push(`_(translation failed: ${entry.error ?? 'unknown error'})_`);
      } else {
        lines.push('_(no translation)_');
      }
      lines.push('');
    }
    if (opts.includeProvider && entry.provider) {
      lines.push(`<sub>source: ${entry.origin} · translated with ${entry.provider}</sub>`);
      lines.push('');
    }
  }
  lines.push('');
  lines.push(`_Exported from ChatterSnap — all data stays on this device._`);
  lines.push('');
  return lines.join('\n');
}

export function toPlainText(session: Session, entries: Entry[], opts: ExportOptions): string {
  const lines: string[] = [];
  const rule = '='.repeat(52);
  lines.push('ChatterSnap Conversation');
  lines.push(rule);
  lines.push(`Session:  ${session.title}`);
  lines.push(`Date:     ${formatDate(session.createdAt)}`);
  lines.push(`Started:  ${formatDateTime(session.createdAt)}`);
  lines.push(`Exported: ${formatDateTime(Date.now())}`);
  lines.push(`Direction: ${directionLabel(session)}`);
  lines.push(`Entries:  ${entries.length}`);
  lines.push(rule);
  lines.push('');

  if (entries.length === 0) {
    lines.push('(No entries in this session.)');
    lines.push('');
    return lines.join('\n');
  }

  for (const entry of entriesInOrder(entries)) {
    if (opts.includeTimestamps) {
      lines.push(`[${formatClockSeconds(entry.createdAt)}]`);
    }
    lines.push('');
    lines.push(`${LANG_CODE[entry.sourceLang]}:`);
    lines.push(entry.sourceText);
    lines.push('');
    if (opts.includeTranslation) {
      lines.push(`${LANG_CODE[entry.targetLang]}:`);
      if (entry.translation) {
        lines.push(entry.translation);
      } else if (entry.status === 'error') {
        lines.push(`(translation failed: ${entry.error ?? 'unknown error'})`);
      } else {
        lines.push('(no translation)');
      }
      lines.push('');
    }
    if (opts.includeProvider && entry.provider) {
      lines.push(`-- source: ${entry.origin} · translated with ${entry.provider}`);
    }
    lines.push('-'.repeat(52));
    lines.push('');
  }

  lines.push('Exported from ChatterSnap — all data stays on this device.');
  return lines.join('\n');
}

/** Filesystem-safe filename stem based on the session title. */
export function exportFilename(session: Session, format: 'md' | 'txt'): string {
  // Local time, so the filename agrees with the "Started" line in the export.
  const d = new Date(session.createdAt);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}`;
  const slug =
    session.title
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'chattersnap';
  return `chattersnap-${slug}-${stamp}.${format}`;
}

export function buildExport(
  session: Session,
  entries: Entry[],
  settings: Settings,
  formatOverride?: 'md' | 'txt',
): { content: string; filename: string; mime: string } {
  const format = formatOverride ?? settings.exportFormat;
  const opts: ExportOptions = {
    includeTranslation: settings.exportIncludeTranslation,
    includeTimestamps: settings.exportIncludeTimestamps,
    includeProvider: true,
  };
  const content = format === 'md' ? toMarkdown(session, entries, opts) : toPlainText(session, entries, opts);
  return {
    content,
    filename: exportFilename(session, format),
    mime: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
  };
}

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}