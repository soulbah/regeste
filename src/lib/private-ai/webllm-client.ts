import { proxy, wrap, type Remote } from 'comlink';
import { guardWorker } from '$lib/state/worker-health.svelte';
import type { GenerationOptions, GenerationResult } from './generation';
import type { LlmApi } from './llm-worker';
import {
	SERVICE_WORKER_RESTARTED,
	ServiceWorkerLifecycle,
	type ServiceRequest
} from './service-worker-lifecycle';
import { ActivityTimeoutError, withActivityTimeout } from './activity-timeout';

const CACHED_LOAD_IDLE_TIMEOUT_MS = 60_000;
const DOWNLOAD_IDLE_TIMEOUT_MS = 180_000;
const DOWNLOAD_START_TIMEOUT_MS = 30_000;
const GENERATION_IDLE_TIMEOUT_MS = 180_000;

export interface WebLlmLoadOptions {
	prepared?: boolean;
}

export interface WebLlmClient {
	load(
		model: string,
		onProgress?: (progress: number, text: string) => void,
		options?: WebLlmLoadOptions
	): Promise<void>;
	generate(
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
		onDelta?: (delta: string) => void,
		options?: GenerationOptions
	): Promise<GenerationResult>;
	abort(): Promise<void>;
	unload(): Promise<void>;
}

type WorkerResponse =
	| { source: 'regeste-llm'; id: string; kind: 'progress'; progress: number; text: string }
	| { source: 'regeste-llm'; id: string; kind: 'delta'; delta: string }
	| { source: 'regeste-llm'; id: string; kind: 'result'; result: unknown }
	| { source: 'regeste-llm'; id: string; kind: 'error'; error: string };

let dedicated: Remote<LlmApi> | null = null;
let dedicatedWorker: Worker | null = null;
let dedicatedModel: string | null = null;
let serviceModel: string | null = null;
let requestedModel: string | null = null;
let listenerInstalled = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatInFlight = false;
const serviceLifecycle = new ServiceWorkerLifecycle();

function dedicatedClient(): Remote<LlmApi> {
	if (!dedicated) {
		const worker = new Worker(new URL('./llm-worker.ts', import.meta.url), { type: 'module' });
		guardWorker(worker, 'privateAi');
		dedicatedWorker = worker;
		dedicated = wrap<LlmApi>(worker);
	}
	return dedicated;
}

function resetDedicatedClient(): void {
	dedicatedWorker?.terminate();
	dedicatedWorker = null;
	dedicated = null;
	dedicatedModel = null;
}

function stopHeartbeat(): void {
	if (heartbeatTimer) clearInterval(heartbeatTimer);
	heartbeatTimer = null;
	heartbeatInFlight = false;
}

function invalidateServiceClient(): void {
	serviceModel = null;
	stopHeartbeat();
	serviceLifecycle.controllerChanged();
}

/** Best-effort cancellation for work already running inside the Service
 * Worker. No response is tracked: invalidation below owns the page promise. */
function controlService(kind: 'abort' | 'unload'): void {
	try {
		navigator.serviceWorker.controller?.postMessage({
			source: 'regeste-llm',
			id: crypto.randomUUID(),
			kind
		});
	} catch {
		// Controller replacement already makes the request obsolete.
	}
}

function installListener(): void {
	if (listenerInstalled || !('serviceWorker' in navigator)) return;
	listenerInstalled = true;
	navigator.serviceWorker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
		const message = event.data;
		if (!message || message.source !== 'regeste-llm') return;
		const request = serviceLifecycle.get(message.id);
		if (!request) return;
		if (message.kind === 'progress') request.onProgress?.(message.progress, message.text);
		else if (message.kind === 'delta') request.onDelta?.(message.delta);
		else if (message.kind === 'result') serviceLifecycle.resolve(message.id, message.result);
		else serviceLifecycle.reject(message.id, new Error(message.error));
	});
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		invalidateServiceClient();
	});
}

function serviceRequest<T>(
	kind: 'load' | 'generate' | 'abort' | 'ping' | 'unload',
	payload: Record<string, unknown>,
	callbacks: Pick<ServiceRequest<T>, 'onProgress' | 'onDelta'> = {},
	timeoutMs?: number
): Promise<T> {
	installListener();
	const controller = navigator.serviceWorker.controller;
	if (!controller) return Promise.reject(new Error('inference service worker unavailable'));
	const id = crypto.randomUUID();
	return new Promise<T>((resolve, reject) => {
		serviceLifecycle.add(id, { resolve, reject, ...callbacks }, timeoutMs);
		try {
			controller.postMessage({ source: 'regeste-llm', id, kind, ...payload });
		} catch (error) {
			serviceLifecycle.reject(id, error instanceof Error ? error : new Error(String(error)));
		}
	});
}

async function probeServiceInstance(timeoutMs = 30_000): Promise<void> {
	const instance = await serviceRequest<unknown>('ping', {}, {}, timeoutMs);
	if (typeof instance !== 'string' || !instance)
		throw new Error('inference service worker returned no boot id');
	serviceLifecycle.observeInstance(instance);
}

function startHeartbeat(): void {
	if (heartbeatTimer) return;
	heartbeatTimer = setInterval(() => {
		// Active loads/generations have their own activity watchdog. A ping queued
		// behind GPU work can time out even while that work reports progress.
		if (heartbeatInFlight || serviceLifecycle.size > 0) return;
		heartbeatInFlight = true;
		void probeServiceInstance()
			.catch(invalidateServiceClient)
			.finally(() => {
				heartbeatInFlight = false;
			});
	}, 10_000);
}

async function waitForController(timeoutMs = 2000): Promise<boolean> {
	if (import.meta.env.DEV || !('serviceWorker' in navigator)) return false;
	if (navigator.serviceWorker.controller) return true;
	return new Promise((resolve) => {
		const finish = (available: boolean) => {
			clearTimeout(timeout);
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
			resolve(available);
		};
		const onControllerChange = () => finish(!!navigator.serviceWorker.controller);
		const timeout = setTimeout(() => finish(false), timeoutMs);
		navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
		// ServiceWorkerContainer.ready never rejects and may wait indefinitely.
		// Keep it inside the same bounded handshake as controllerchange so model
		// loading can fall back to a dedicated worker instead of freezing the UI.
		void navigator.serviceWorker.ready.then(
			() => finish(!!navigator.serviceWorker.controller),
			() => finish(false)
		);
	});
}

async function loadService(
	model: string,
	onProgress: ((progress: number, text: string) => void) | undefined,
	idleTimeoutMs: number,
	initialTimeoutMs = idleTimeoutMs
): Promise<boolean> {
	if (!(await waitForController())) return false;
	// Establish worker identity before the long model load. The heartbeat then
	// detects a browser killing this instance and booting another behind the
	// same controller — the case controllerchange alone cannot see.
	await probeServiceInstance(5_000);
	await withActivityTimeout(
		(activity) =>
			serviceRequest<void>(
				'load',
				{ model },
				{
					onProgress: (progress, text) => {
						activity();
						onProgress?.(progress, text);
					}
				}
			),
		idleTimeoutMs,
		() => {
			controlService('unload');
			invalidateServiceClient();
		},
		initialTimeoutMs
	);
	serviceModel = model;
	startHeartbeat();
	return true;
}

async function loadDedicated(
	model: string,
	onProgress: ((progress: number, text: string) => void) | undefined,
	idleTimeoutMs: number,
	initialTimeoutMs = idleTimeoutMs
): Promise<void> {
	await withActivityTimeout(
		(activity) =>
			dedicatedClient().load(
				model,
				proxy((progress: number, text: string) => {
					activity();
					onProgress?.(progress, text);
				})
			),
		idleTimeoutMs,
		resetDedicatedClient,
		initialTimeoutMs
	);
	dedicatedModel = model;
	serviceModel = null;
}

async function generateDedicated(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	onDelta: ((delta: string) => void) | undefined,
	options: GenerationOptions
): Promise<GenerationResult> {
	return withActivityTimeout(
		(activity) =>
			dedicatedClient().generate(
				messages,
				proxy((delta: string) => {
					activity();
					onDelta?.(delta);
				}),
				options
			),
		GENERATION_IDLE_TIMEOUT_MS,
		resetDedicatedClient
	);
}

function generateServiceRequest(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	onDelta: ((delta: string) => void) | undefined,
	options: GenerationOptions
): Promise<GenerationResult> {
	return withActivityTimeout(
		(activity) =>
			serviceRequest<GenerationResult>(
				'generate',
				{ messages, options },
				{
					onDelta: (delta) => {
						activity();
						onDelta?.(delta);
					}
				}
			),
		GENERATION_IDLE_TIMEOUT_MS,
		() => {
			controlService('abort');
			invalidateServiceClient();
		}
	);
}

async function generateService(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	onDelta: ((delta: string) => void) | undefined,
	options: GenerationOptions
): Promise<GenerationResult> {
	const model = serviceModel;
	try {
		return await generateServiceRequest(messages, onDelta, options);
	} catch (error) {
		const recoverable =
			String(error).includes('not loaded') ||
			String(error).includes(SERVICE_WORKER_RESTARTED) ||
			String(error).includes('timed out') ||
			error instanceof ActivityTimeoutError;
		if (!model || !recoverable) throw error;
		if (!(await loadService(model, undefined, CACHED_LOAD_IDLE_TIMEOUT_MS))) throw error;
		return generateServiceRequest(messages, onDelta, options);
	}
}

export const webLlmClient: WebLlmClient = {
	async load(model, onProgress, options = {}) {
		const idleTimeoutMs = options.prepared ? CACHED_LOAD_IDLE_TIMEOUT_MS : DOWNLOAD_IDLE_TIMEOUT_MS;
		const initialTimeoutMs = options.prepared
			? CACHED_LOAD_IDLE_TIMEOUT_MS
			: DOWNLOAD_START_TIMEOUT_MS;
		requestedModel = model;
		serviceModel = null;
		stopHeartbeat();
		resetDedicatedClient();
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				if (await loadService(model, onProgress, idleTimeoutMs, initialTimeoutMs)) return;
				break;
			} catch (error) {
				if (attempt === 0 && String(error).includes(SERVICE_WORKER_RESTARTED)) continue;
				if (error instanceof ActivityTimeoutError || String(error).includes('timed out')) break;
				throw error;
			}
		}
		serviceModel = null;
		stopHeartbeat();
		await loadDedicated(model, onProgress, idleTimeoutMs, initialTimeoutMs);
	},

	async generate(messages, onDelta, options = { reasoning: 'off', maxTokens: 320 }) {
		if (serviceModel) return generateService(messages, onDelta, options);
		if (dedicatedModel) return generateDedicated(messages, onDelta, options);
		if (!requestedModel) throw new Error('private engine not loaded');
		try {
			if (await loadService(requestedModel, undefined, CACHED_LOAD_IDLE_TIMEOUT_MS))
				return generateService(messages, onDelta, options);
		} catch {
			// A replaced Service Worker recovers through a fresh dedicated worker.
		}
		await loadDedicated(requestedModel, undefined, CACHED_LOAD_IDLE_TIMEOUT_MS);
		return generateDedicated(messages, onDelta, options);
	},

	async abort() {
		if (serviceModel) await serviceRequest<void>('abort', {});
		else if (dedicatedModel) await dedicatedClient().abort();
	},

	async unload() {
		requestedModel = null;
		serviceModel = null;
		stopHeartbeat();
		resetDedicatedClient();
		if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
		try {
			await serviceRequest<void>('unload', {}, {}, 10_000);
		} finally {
			invalidateServiceClient();
		}
	}
};
