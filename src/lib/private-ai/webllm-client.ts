import { wrap, type Remote } from 'comlink';
import { guardWorker } from '$lib/state/worker-health.svelte';
import type { GenerationOptions, GenerationResult } from './generation';
import type { LlmApi } from './llm-worker';
import {
	SERVICE_WORKER_RESTARTED,
	ServiceWorkerLifecycle,
	type ServiceRequest
} from './service-worker-lifecycle';

export interface WebLlmClient {
	load(model: string, onProgress?: (progress: number, text: string) => void): Promise<void>;
	generate(
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
		onDelta?: (delta: string) => void,
		options?: GenerationOptions
	): Promise<GenerationResult>;
	abort(): Promise<void>;
}

type WorkerResponse =
	| { source: 'regeste-llm'; id: string; kind: 'progress'; progress: number; text: string }
	| { source: 'regeste-llm'; id: string; kind: 'delta'; delta: string }
	| { source: 'regeste-llm'; id: string; kind: 'result'; result: unknown }
	| { source: 'regeste-llm'; id: string; kind: 'error'; error: string };

let dedicated: Remote<LlmApi> | null = null;
let serviceModel: string | null = null;
let listenerInstalled = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatInFlight = false;
const serviceLifecycle = new ServiceWorkerLifecycle();

function dedicatedClient(): Remote<LlmApi> {
	if (!dedicated) {
		const worker = new Worker(new URL('./llm-worker.ts', import.meta.url), { type: 'module' });
		guardWorker(worker, 'privateAi');
		dedicated = wrap<LlmApi>(worker);
	}
	return dedicated;
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
		serviceLifecycle.controllerChanged();
	});
}

function serviceRequest<T>(
	kind: 'load' | 'generate' | 'abort' | 'ping',
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
		controller.postMessage({ source: 'regeste-llm', id, kind, ...payload });
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
		if (heartbeatInFlight) return;
		heartbeatInFlight = true;
		void probeServiceInstance()
			.catch(() => serviceLifecycle.controllerChanged())
			.finally(() => {
				heartbeatInFlight = false;
			});
	}, 10_000);
}

async function waitForController(timeoutMs = 2000): Promise<boolean> {
	if (import.meta.env.DEV || !('serviceWorker' in navigator)) return false;
	await navigator.serviceWorker.ready;
	if (navigator.serviceWorker.controller) return true;
	return new Promise((resolve) => {
		const timeout = setTimeout(() => resolve(false), timeoutMs);
		navigator.serviceWorker.addEventListener(
			'controllerchange',
			() => {
				clearTimeout(timeout);
				resolve(!!navigator.serviceWorker.controller);
			},
			{ once: true }
		);
	});
}

async function loadService(
	model: string,
	onProgress?: (progress: number, text: string) => void
): Promise<boolean> {
	if (!(await waitForController())) return false;
	// Establish worker identity before the long model load. The heartbeat then
	// detects a browser killing this instance and booting another behind the
	// same controller — the case controllerchange alone cannot see.
	await probeServiceInstance(5_000);
	startHeartbeat();
	await serviceRequest<void>('load', { model }, { onProgress });
	serviceModel = model;
	return true;
}

async function generateService(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	onDelta: ((delta: string) => void) | undefined,
	options: GenerationOptions
): Promise<GenerationResult> {
	try {
		return await serviceRequest<GenerationResult>('generate', { messages, options }, { onDelta });
	} catch (error) {
		const recoverable =
			String(error).includes('not loaded') ||
			String(error).includes(SERVICE_WORKER_RESTARTED) ||
			String(error).includes('timed out');
		if (!serviceModel || !recoverable) throw error;
		await loadService(serviceModel);
		return serviceRequest<GenerationResult>('generate', { messages, options }, { onDelta });
	}
}

export const webLlmClient: WebLlmClient = {
	async load(model, onProgress) {
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				if (await loadService(model, onProgress)) return;
				break;
			} catch (error) {
				if (attempt === 0 && String(error).includes(SERVICE_WORKER_RESTARTED)) continue;
				throw error;
			}
		}
		await dedicatedClient().load(model, onProgress);
	},

	async generate(messages, onDelta, options = { reasoning: 'off', maxTokens: 320 }) {
		if (serviceModel) return generateService(messages, onDelta, options);
		return dedicatedClient().generate(messages, onDelta, options);
	},

	async abort() {
		if (serviceModel) await serviceRequest<void>('abort', {});
		else await dedicatedClient().abort();
	}
};
