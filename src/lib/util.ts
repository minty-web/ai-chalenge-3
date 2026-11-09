/** Small id helper — avoids a uuid dependency and works on insecure origins. */
export function newId(prefix = 'e'): string {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  let out = '';
  for (const b of rand) out += b.toString(16).padStart(2, '0');
  return `${prefix}_${Date.now().toString(36)}_${out}`;
}

/** `18:42` — local time, used in the notebook and in exports. */
export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** `18:42:07` — with seconds, for exports. */
export function formatClockSeconds(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatDateTime(ts: number): string {
  return `${formatDate(ts)} ${formatClock(ts)}`;
}

/** `01:23` duration for the recording timer. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}