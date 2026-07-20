// PWA state (spec 030): install availability, update readiness, connectivity,
// and storage persistence. A rune module rather than the plugin ecosystem's
// Svelte stores, which the runes-only rule forbids.

import { isShellCache } from '$lib/pwa/cache-names';

interface InstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INVITE_DISMISSED_KEY = 'folio:install-invite-dismissed';

class PwaStore {
	/** A browser-provided install prompt is available (Chromium only). */
	installAvailable = $state(false);
	/** Running as an installed app. */
	installed = $state(false);
	/** A new version is waiting; applying it reloads. */
	updateReady = $state(false);
	offline = $state(false);
	persisted = $state<boolean | null>(null);

	private deferred: InstallPromptEvent | null = null;
	private waiting: ServiceWorker | null = null;
	private reloading = false;

	init(): void {
		if (typeof window === 'undefined') return;
		this.installed =
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as { standalone?: boolean }).standalone === true;
		this.offline = !navigator.onLine;

		window.addEventListener('beforeinstallprompt', (event) => {
			event.preventDefault();
			this.deferred = event as InstallPromptEvent;
			this.installAvailable = true;
		});
		window.addEventListener('appinstalled', () => {
			this.deferred = null;
			this.installAvailable = false;
			this.installed = true;
			// The installed-app grant path has just become available.
			void this.ensurePersisted();
		});
		window.addEventListener('online', () => (this.offline = false));
		window.addEventListener('offline', () => (this.offline = true));
	}

	/** Wire update detection to a registration (production only). */
	watch(registration: ServiceWorkerRegistration): void {
		const consider = (worker: ServiceWorker | null) => {
			if (!worker) return;
			const check = () => {
				if (worker.state === 'installed' && navigator.serviceWorker.controller) {
					this.waiting = worker;
					this.updateReady = true;
				}
			};
			check();
			worker.addEventListener('statechange', check);
		};
		consider(registration.waiting);
		registration.addEventListener('updatefound', () => consider(registration.installing));
		// Reload only when an update swapped the worker out from under a page that
		// already had one. On a first-ever visit `clients.claim()` also fires this,
		// with no previous controller — reloading there restarts a session nobody
		// asked to restart, and it wipes any state the boot had already recorded
		// (a failed worker, for one). Measured: five navigations on a first load.
		const hadController = !!navigator.serviceWorker.controller;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (this.reloading || !hadController) return;
			this.reloading = true;
			window.location.reload();
		});
	}

	/** Apply a waiting update. The caller decides when it is safe (never during
	 * a generation or a model download). */
	applyUpdate(): void {
		this.waiting?.postMessage({ source: 'folio-pwa', kind: 'skip-waiting' });
		this.updateReady = false;
	}

	/** Show the browser install prompt. Must run inside a user gesture, and the
	 * event is single-use. */
	async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
		if (!this.deferred) return 'unavailable';
		const event = this.deferred;
		this.deferred = null;
		this.installAvailable = false;
		await event.prompt();
		const { outcome } = await event.userChoice;
		return outcome;
	}

	/** Ask for persistent storage. Chrome grants this to installed apps without
	 * further engagement; elsewhere it is heuristic or prompted. Reflect the real
	 * result — never claim data is safe. */
	async ensurePersisted(): Promise<boolean> {
		try {
			if (await navigator.storage.persisted()) {
				this.persisted = true;
				return true;
			}
			this.persisted = await navigator.storage.persist();
			return this.persisted;
		} catch {
			this.persisted = null;
			return false;
		}
	}

	get inviteDismissed(): boolean {
		try {
			return localStorage.getItem(INVITE_DISMISSED_KEY) === '1';
		} catch {
			return false;
		}
	}

	dismissInvite(): void {
		try {
			localStorage.setItem(INVITE_DISMISSED_KEY, '1');
		} catch {
			// A browser that refuses storage will re-offer; harmless.
		}
	}

	/** True when it is worth inviting the user to install before a large
	 * download: not installed and not already dismissed. */
	get shouldInviteInstall(): boolean {
		return !this.installed && !this.inviteDismissed;
	}

	/** iOS can install, but only through the share sheet — there is no
	 * beforeinstallprompt on any iOS browser. Detected so the invitation can
	 * explain the manual route there and stay silent where installing is
	 * impossible (Firefox desktop). */
	get isIosSafari(): boolean {
		if (typeof navigator === 'undefined') return false;
		return (
			/iPad|iPhone|iPod/.test(navigator.userAgent) ||
			// iPadOS reports as a Mac; the touch points give it away.
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
		);
	}

	/** Shell caches are app infrastructure, not user data. */
	static isShellCache = isShellCache;
}

export const pwaStore = new PwaStore();
