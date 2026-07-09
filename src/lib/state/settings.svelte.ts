// Trust-pack settings (spec 009): force-offline switch, storage status and
// the panic wipe. All device-local; the offline flag persists in the local DB.

import { getLocalDb } from '$lib/local-db/client';

export interface StorageStatus {
	usage: number;
	quota: number;
	persisted: boolean;
}

class SettingsStore {
	/** T2 — when true, guardedFetch refuses every outgoing request. */
	forceOffline = $state(false);
	storage = $state<StorageStatus | null>(null);
	wiping = $state(false);

	private loaded = false;

	async init(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		const { db } = await getLocalDb();
		this.forceOffline = (await db.getSetting('force_offline')) === '1';
		await this.refreshStorage();
	}

	async refreshStorage(): Promise<void> {
		try {
			const [estimate, persisted] = await Promise.all([
				navigator.storage.estimate(),
				navigator.storage.persisted()
			]);
			this.storage = {
				usage: estimate.usage ?? 0,
				quota: estimate.quota ?? 0,
				persisted
			};
		} catch {
			this.storage = null;
		}
	}

	async requestPersistence(): Promise<void> {
		try {
			await navigator.storage.persist();
		} finally {
			await this.refreshStorage();
		}
	}

	async setForceOffline(on: boolean): Promise<void> {
		this.forceOffline = on;
		const { db } = await getLocalDb();
		await db.setSetting('force_offline', on ? '1' : null);
	}

	/**
	 * T1 — destroy everything local: SQLite pool files (via the worker, which
	 * owns the OPFS handles), original documents, model caches. Then reload
	 * into a factory-fresh app. Nothing here touches the network.
	 */
	async wipeEverything(): Promise<void> {
		this.wiping = true;
		try {
			const { db } = await getLocalDb();
			await db.wipeDatabase();
		} catch {
			// DB may be unopenable — keep wiping the rest.
		}
		try {
			const root = await navigator.storage.getDirectory();
			for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
				await root.removeEntry(name, { recursive: true }).catch(() => {});
			}
		} catch {
			// OPFS unavailable — nothing stored there then.
		}
		try {
			for (const key of await caches.keys()) await caches.delete(key);
		} catch {
			// Cache API unavailable
		}
		localStorage.clear();
		sessionStorage.clear();
		location.href = '/';
	}
}

export const settingsStore = new SettingsStore();
