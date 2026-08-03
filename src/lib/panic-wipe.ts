import { resolve } from '$app/paths';
import type { Locale } from '$lib/i18n/index.svelte';
import { SERVICE_WORKER_RESTARTED } from '$lib/private-ai/service-worker-lifecycle';

const WIPE_PARAM = 'wipe-local-data';
const LOCALE_PARAM = 'wipe-locale';
const COMPLETE_PARAM = 'reset-complete';
const SERVER_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 15_000;
const DELETE_TIMEOUT_MS = 60_000;

export type PanicWipePhase = 'stopping' | 'clearing' | 'finishing';

export interface PanicWipeActions {
	requestNativeWipe(): Promise<void>;
	stopInference(): Promise<void>;
	unregisterWorkers(): Promise<void>;
	deleteCaches(): Promise<void>;
	deleteOpfs(): Promise<void>;
	clearWebStorage(): void;
}

export interface PanicWipeTimeouts {
	server: number;
	stop: number;
	delete: number;
}

const DEFAULT_TIMEOUTS: PanicWipeTimeouts = {
	server: SERVER_TIMEOUT_MS,
	stop: STOP_TIMEOUT_MS,
	delete: DELETE_TIMEOUT_MS
};

function deadline<T>(promise: Promise<T>, timeoutMs: number, step: string): Promise<T> {
	return new Promise<T>((resolvePromise, reject) => {
		const timer = setTimeout(() => reject(new Error(`${step} timed out`)), timeoutMs);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolvePromise(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

async function tolerateExpectedWorkerShutdown(promise: Promise<void>): Promise<void> {
	try {
		await promise;
	} catch (error) {
		// Clear-Site-Data unregisters the inference Service Worker. Its lifecycle
		// rejects any request still crossing that controller at the same instant;
		// this confirms shutdown rather than a failed deletion.
		if (String(error).includes(SERVICE_WORKER_RESTARTED)) return;
		throw error;
	}
}

async function requestNativeWipe(): Promise<void> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
	try {
		const response = await fetch('/api/local-wipe', {
			method: 'POST',
			cache: 'no-store',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ confirm: 'erase-local-data' }),
			signal: controller.signal
		});
		if (!response.ok) throw new Error(`native wipe failed: ${response.status}`);
	} finally {
		clearTimeout(timer);
	}
}

async function unregisterWorkers(): Promise<void> {
	if (!('serviceWorker' in navigator)) return;
	const registrations = await navigator.serviceWorker.getRegistrations();
	await Promise.all(registrations.map((registration) => registration.unregister()));
}

async function deleteCaches(): Promise<void> {
	if (!('caches' in globalThis)) return;
	const names = await caches.keys();
	await Promise.all(names.map((name) => caches.delete(name)));
}

async function deleteOpfs(): Promise<void> {
	if (!navigator.storage?.getDirectory) return;
	const root = await navigator.storage.getDirectory();
	const removable = root as FileSystemDirectoryHandle & {
		remove?: (options: { recursive: boolean }) => Promise<void>;
	};
	if (typeof removable.remove === 'function') {
		try {
			await removable.remove({ recursive: true });
			return;
		} catch {
			// Older Chromium builds expose remove() on the root but reject it. The
			// parent-directory API below is the compatible equivalent.
		}
	}
	for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
		await root.removeEntry(name, { recursive: true });
	}
}

const browserActions: PanicWipeActions = {
	requestNativeWipe,
	stopInference: async () => {
		// Entering this isolated wipe boot already terminated page-owned WebLLM and
		// wllama Workers. Only the inference Service Worker survives navigation, so
		// stop it explicitly before its cache disappears. Keep that control path out
		// of the root layout's eager chunk; most visits never wipe.
		const { webLlmClient } = await import('$lib/private-ai/webllm-client');
		await webLlmClient.unload();
	},
	unregisterWorkers,
	deleteCaches,
	deleteOpfs,
	clearWebStorage: () => {
		localStorage.clear();
		sessionStorage.clear();
	}
};

/**
 * Erase one origin without letting its inference worker recreate what disappeared.
 *
 * Inference is stopped before the browser-native storage clear. Manual deletion
 * then runs as a compatibility fallback and verifies that no script-visible
 * store remains. Every phase has a deadline: a wedged worker cannot leave the
 * destructive control disabled forever.
 */
export async function performPanicWipe(
	onPhase: (phase: PanicWipePhase) => void,
	actions: PanicWipeActions = browserActions,
	timeouts: PanicWipeTimeouts = DEFAULT_TIMEOUTS
): Promise<void> {
	onPhase('stopping');
	try {
		await deadline(actions.stopInference(), timeouts.stop, 'inference shutdown');
	} catch {
		// Storage deletion remains authoritative. A broken inference channel must
		// never turn the panic wipe into an eternal disabled control.
	}

	onPhase('clearing');
	try {
		await deadline(actions.requestNativeWipe(), timeouts.server, 'native wipe');
	} catch {
		// Offline and browsers without Clear-Site-Data use the local path below.
	}
	await deadline(
		Promise.all([
			tolerateExpectedWorkerShutdown(actions.unregisterWorkers()),
			actions.deleteCaches(),
			actions.deleteOpfs()
		]).then(() => undefined),
		timeouts.delete,
		'local data deletion'
	);
	actions.clearWebStorage();
	onPhase('finishing');
}

export function panicWipeContext(url: URL): {
	active: boolean;
	complete: boolean;
	locale: Locale;
} {
	const locale = url.searchParams.get(LOCALE_PARAM) === 'fr' ? 'fr' : 'en';
	return {
		active: url.searchParams.get(WIPE_PARAM) === '1',
		complete: url.searchParams.get(COMPLETE_PARAM) === '1',
		locale
	};
}

export function panicWipeUrl(locale: Locale): string {
	const params = new URLSearchParams({ [WIPE_PARAM]: '1', [LOCALE_PARAM]: locale });
	return `${resolve('/chat')}?${params}`;
}

export function panicWipeCompletionUrl(locale: Locale): string {
	const params = new URLSearchParams({ [COMPLETE_PARAM]: '1', [LOCALE_PARAM]: locale });
	return `${resolve('/chat')}?${params}`;
}
