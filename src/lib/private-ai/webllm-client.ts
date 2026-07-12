import { wrap, type Remote } from 'comlink';
import type { GenerationOptions, GenerationResult } from './generation';
import type { LlmApi } from './llm-worker';

export interface WebLlmClient {
	load(model: string, onProgress?: (progress: number, text: string) => void): Promise<void>;
	generate(
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
		onDelta?: (delta: string) => void,
		options?: GenerationOptions
	): Promise<GenerationResult>;
	abort(): Promise<void>;
}

interface PendingRequest<T> {
	resolve: (value: T) => void;
	reject: (error: Error) => void;
	onProgress?: (progress: number, text: string) => void;
	onDelta?: (delta: string) => void;
}

type WorkerResponse =
	| { source: 'folio-llm'; id: string; kind: 'progress'; progress: number; text: string }
	| { source: 'folio-llm'; id: string; kind: 'delta'; delta: string }
	| { source: 'folio-llm'; id: string; kind: 'result'; result: unknown }
	| { source: 'folio-llm'; id: string; kind: 'error'; error: string };

let dedicated: Remote<LlmApi> | null = null;
let serviceModel: string | null = null;
let listenerInstalled = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const pending = new Map<string, PendingRequest<unknown>>();

function dedicatedClient(): Remote<LlmApi> {
	if (!dedicated) {
		dedicated = wrap<LlmApi>(
			new Worker(new URL('./llm-worker.ts', import.meta.url), { type: 'module' })
		);
	}
	return dedicated;
}

function installListener(): void {
	if (listenerInstalled || !('serviceWorker' in navigator)) return;
	listenerInstalled = true;
	navigator.serviceWorker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
		const message = event.data;
		if (!message || message.source !== 'folio-llm') return;
		const request = pending.get(message.id);
		if (!request) return;
		if (message.kind === 'progress') request.onProgress?.(message.progress, message.text);
		else if (message.kind === 'delta') request.onDelta?.(message.delta);
		else if (message.kind === 'result') {
			pending.delete(message.id);
			request.resolve(message.result);
		} else {
			pending.delete(message.id);
			request.reject(new Error(message.error));
		}
	});
}

function serviceRequest<T>(
	kind: 'load' | 'generate' | 'abort',
	payload: Record<string, unknown>,
	callbacks: Pick<PendingRequest<T>, 'onProgress' | 'onDelta'> = {}
): Promise<T> {
	installListener();
	const controller = navigator.serviceWorker.controller;
	if (!controller) return Promise.reject(new Error('inference service worker unavailable'));
	const id = crypto.randomUUID();
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (value: unknown) => void, reject, ...callbacks });
		controller.postMessage({ source: 'folio-llm', id, kind, ...payload });
	});
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
	await serviceRequest<void>('load', { model }, { onProgress });
	serviceModel = model;
	if (!heartbeatTimer) {
		heartbeatTimer = setInterval(() => {
			navigator.serviceWorker.controller?.postMessage({
				source: 'folio-llm',
				id: crypto.randomUUID(),
				kind: 'ping'
			});
		}, 10_000);
	}
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
		if (!serviceModel || !String(error).includes('not loaded')) throw error;
		await loadService(serviceModel);
		return serviceRequest<GenerationResult>('generate', { messages, options }, { onDelta });
	}
}

export const webLlmClient: WebLlmClient = {
	async load(model, onProgress) {
		if (await loadService(model, onProgress)) return;
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
