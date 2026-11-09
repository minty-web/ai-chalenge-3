import Dexie, { type Table } from 'dexie';
import type { Entry, Session } from '../types';

/**
 * IndexedDB is the primary store. Every completed entry is written immediately,
 * so a refresh or crash can never lose a finished sentence.
 */
export class ChatterSnapDB extends Dexie {
  sessions!: Table<Session, string>;
  entries!: Table<Entry, string>;

  constructor(name = 'chattersnap') {
    super(name);
    this.version(1).stores({
      sessions: 'id, updatedAt, createdAt',
      entries: 'id, sessionId, createdAt, [sessionId+createdAt]',
    });
  }
}

export const db = new ChatterSnapDB();

export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

function wrap<T>(what: string, run: () => Promise<T>): Promise<T> {
  return run().catch((err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err);
    throw new StorageError(`${what}: ${detail}`, err);
  });
}

export function createSessionRecord(direction: Session['direction'], title: string): Session {
  const now = Date.now();
  return {
    id: `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    direction,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listSessions(): Promise<Session[]> {
  return wrap('Could not read sessions', async () => {
    const all = await db.sessions.toArray();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

export async function getSession(id: string): Promise<Session | undefined> {
  return wrap('Could not read the session', () => db.sessions.get(id));
}

export async function putSession(session: Session): Promise<void> {
  await wrap('Could not save the session', () => db.sessions.put(session));
}

export async function deleteSessionDeep(id: string): Promise<void> {
  return wrap('Could not delete the session', () =>
    db.transaction('rw', [db.sessions, db.entries], async () => {
      await db.entries.where('sessionId').equals(id).delete();
      await db.sessions.delete(id);
    }),
  );
}

export async function listEntries(sessionId: string): Promise<Entry[]> {
  return wrap('Could not read the notebook', async () => {
    const rows = await db.entries.where('sessionId').equals(sessionId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  });
}

export async function countEntries(sessionId: string): Promise<number> {
  return wrap('Could not count entries', () =>
    db.entries.where('sessionId').equals(sessionId).count(),
  );
}

export async function putEntryUnchecked(entry: Entry): Promise<void> {
  await db.entries.put(entry);
}

export async function putEntry(entry: Entry): Promise<void> {
  await wrap('Could not save this entry', () => db.entries.put(entry));
}

export async function deleteEntry(id: string): Promise<void> {
  await wrap('Could not delete this entry', () => db.entries.delete(id));
}

export async function clearSessionEntries(sessionId: string): Promise<void> {
  await wrap('Could not clear the notebook', () =>
    db.entries.where('sessionId').equals(sessionId).delete(),
  );
}

export async function touchSession(sessionId: string): Promise<void> {
  return wrap('Could not update the session', async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    await db.sessions.put({ ...s, updatedAt: Date.now() });
  });
}

/** Rough storage health, surfaced in the settings panel. */
export async function storageStatus(): Promise<{ available: boolean; usage: string | null }> {
  try {
    await db.sessions.count();
  } catch {
    return { available: false, usage: null };
  }
  let usage: string | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) usage = `${(est.usage / 1024 / 1024).toFixed(2)} MB`;
  } catch {
    usage = null;
  }
  return { available: true, usage };
}