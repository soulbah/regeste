// Main-thread handle to the db worker. Browser-only — import lazily from
// client code (never during SSR). A Web Lock makes the first tab the single
// DB owner: opfs-sahpool corrupts under concurrent connections (Notion's bug),
// so a second tab gets `locked` instead of a connection. Full multi-tab
// proxying is spec 003+ work.

import { wrap, type Remote } from 'comlink';
import type { DbApi, DbInfo } from './worker';

export type LocalDb = Remote<DbApi>;

let dbPromise: Promise<{ db: LocalDb; info: DbInfo }> | null = null;
let lockRelease: (() => void) | null = null;

export class DbLockedError extends Error {
	constructor() {
		super('The local database is open in another tab.');
	}
}

export function getLocalDb(): Promise<{ db: LocalDb; info: DbInfo }> {
	if (!dbPromise) {
		dbPromise = acquire();
		dbPromise.catch(() => (dbPromise = null));
	}
	return dbPromise;
}

async function acquire(): Promise<{ db: LocalDb; info: DbInfo }> {
	const granted = await new Promise<boolean>((resolve) => {
		navigator.locks.request('folio-db-owner', { ifAvailable: true }, async (lock) => {
			if (!lock) {
				resolve(false);
				return;
			}
			resolve(true);
			// Hold the lock until the tab closes.
			await new Promise<void>((release) => (lockRelease = release));
		});
	});
	if (!granted) throw new DbLockedError();

	const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
	const db = wrap<DbApi>(worker);
	const info = await db.init();
	return { db, info };
}

export function releaseDbLock(): void {
	lockRelease?.();
	lockRelease = null;
}
