// Trust-pack settings (spec 009): force-offline switch, storage status and
// the panic wipe. All device-local; the offline flag persists in the local DB.
// Spec 015 adds the workspace export (R1) and the Assisted quota gauge (R5).

import { zipSync, strToU8 } from 'fflate';
import { getLocalDb } from '$lib/local-db/client';
import { readOriginal } from '$lib/opfs';
import { guardedFetch } from '$lib/net';

export interface StorageStatus {
	usage: number;
	quota: number;
	persisted: boolean;
}

class SettingsStore {
	/** T2 — when true, guardedFetch refuses every outgoing request. */
	forceOffline = $state(false);
	/** R6 — the one-time "data leaves this device" acknowledgment. */
	assistedConsented = $state(false);
	storage = $state<StorageStatus | null>(null);
	wiping = $state(false);
	exporting = $state(false);
	/** R5 — this month's Assisted usage; null when signed out/unknown. */
	quota = $state<{ used: number; limit: number } | null>(null);
	/** Spec 021 — mode applied to newly created chats. */
	defaultMode = $state<'private' | 'assisted' | 'myai'>('private');
	/** Spec 022 — false until the user picks a mode for the first time. */
	modeChosen = $state(false);

	private loaded = false;

	async init(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		const { db } = await getLocalDb();
		this.forceOffline = (await db.getSetting('force_offline')) === '1';
		this.assistedConsented = (await db.getSetting('assisted_consented')) === '1';
		const mode = await db.getSetting('default_mode');
		if (mode === 'assisted' || mode === 'myai') this.defaultMode = mode;
		this.modeChosen = (await db.getSetting('mode_chosen')) === '1';
		await this.refreshStorage();
	}

	async markModeChosen(): Promise<void> {
		if (this.modeChosen) return;
		this.modeChosen = true;
		const { db } = await getLocalDb();
		await db.setSetting('mode_chosen', '1');
	}

	async setDefaultMode(mode: 'private' | 'assisted' | 'myai'): Promise<void> {
		this.defaultMode = mode;
		const { db } = await getLocalDb();
		await db.setSetting('default_mode', mode === 'private' ? null : mode);
	}

	async acknowledgeAssisted(): Promise<void> {
		this.assistedConsented = true;
		const { db } = await getLocalDb();
		await db.setSetting('assisted_consented', '1');
	}

	/** R5 — read-only usage fetch; silent when signed out or offline. */
	async refreshQuota(): Promise<void> {
		try {
			const res = await guardedFetch('/api/quota');
			this.quota = res.ok ? await res.json() : null;
		} catch {
			this.quota = null;
		}
	}

	/**
	 * R1 — export the whole workspace as a plain zip (JSON + original files),
	 * built client-side. The anti-eviction safety net; encrypted export is V1.1.
	 */
	async exportWorkspace(): Promise<void> {
		if (this.exporting) return;
		this.exporting = true;
		try {
			const { db } = await getLocalDb();
			const data = (await db.exportData()) as {
				documents: Array<{ hash: string; name: string }>;
			} & Record<string, unknown>;
			const files: Record<string, Uint8Array> = {};
			const missing: string[] = [];
			for (const doc of data.documents) {
				const bytes = await readOriginal(doc.hash);
				if (bytes) files[`originals/${doc.hash}-${doc.name}`] = new Uint8Array(bytes);
				else missing.push(doc.name);
			}
			files['workspace.json'] = strToU8(
				JSON.stringify({ ...data, missingOriginals: missing }, null, 2)
			);
			const zip = zipSync(files);
			const arrayBuffer = new ArrayBuffer(zip.byteLength);
			new Uint8Array(arrayBuffer).set(zip);
			const blob = new Blob([arrayBuffer], { type: 'application/zip' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `regeste-workspace-${new Date().toISOString().slice(0, 10)}.zip`;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			this.exporting = false;
		}
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
			// Unregister first: deleting the shell cache under a live worker would
			// leave the reload below running against a worker whose cache is gone.
			if ('serviceWorker' in navigator) {
				for (const registration of await navigator.serviceWorker.getRegistrations()) {
					await registration.unregister().catch(() => {});
				}
			}
		} catch {
			// No service worker — nothing to unregister.
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
