/**
 * The last measurement, kept in the browser's IndexedDB so a reload does not lose it. Nothing
 * leaves the machine: this is the same privacy rule as the rest of the tool, only with memory.
 *
 * What is kept is what cannot be recomputed: the raw `stats.json` text, the compressed size per
 * file (the folder's contents are not needed again — the analysis only uses the sizes), the
 * baseline snapshot and the raw text of the context files. Everything else derives from these.
 *
 * Every call resolves instead of throwing: with IndexedDB unavailable (some `file://` setups,
 * private windows) the feature silently does not exist.
 */

import { EMPTY_HISTORY, type History, isHistory } from '../history/history';
import { type StoredSession } from './persistence.types';

const DB_NAME = 'loadline';
const STORE = 'session';
const KEY = 'last';
/** The measurements kept over time. Same store, second key: it is the same kind of memory. */
const HISTORY_KEY = 'history';

const open = (): Promise<IDBDatabase | null> =>
    new Promise(resolve => {
        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.addEventListener('upgradeneeded', () => request.result.createObjectStore(STORE));
            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => resolve(null));
        } catch {
            resolve(null);
        }
    });

const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => {
    const db = await open();
    if (!db) {
        return null;
    }

    return new Promise(resolve => {
        try {
            const request = run(db.transaction(STORE, mode).objectStore(STORE));
            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => resolve(null));
        } catch {
            resolve(null);
        } finally {
            // The connection is per-operation: cheap, and it never blocks another tab.
            setTimeout(() => db.close());
        }
    });
};

export const saveSession = async (session: StoredSession): Promise<void> => {
    await withStore('readwrite', store => store.put(session, KEY));
};

/**
 * The last N measurements. Read and written whole: twenty small points, and a partial write would
 * be a history with a gap in it, which is worse than no history at all.
 */
export const saveHistory = async (history: History): Promise<void> => {
    await withStore('readwrite', store => store.put(history, HISTORY_KEY));
};

export const loadHistory = async (): Promise<History> => {
    const stored = await withStore('readonly', store => store.get(HISTORY_KEY) as IDBRequest<unknown>);
    return isHistory(stored) ? stored : EMPTY_HISTORY;
};

export const clearHistory = async (): Promise<void> => {
    await withStore('readwrite', store => store.delete(HISTORY_KEY));
};

export const loadSession = async (): Promise<StoredSession | null> => {
    const stored = await withStore('readonly', store => store.get(KEY) as IDBRequest<StoredSession | undefined>);
    return stored ?? null;
};

export const clearSession = async (): Promise<void> => {
    await withStore('readwrite', store => store.delete(KEY));
};
