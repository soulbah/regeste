/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { CreateMLCEngine, type MLCEngineInterface } from '@mlc-ai/web-llm';
import { proxiedAppConfig } from '$lib/private-ai/webllm-config';
import type { GenerationOptions, GenerationResult } from '$lib/private-ai/generation';

const sw = self as unknown as ServiceWorkerGlobalScope;
let engine: MLCEngineInterface | null = null;
let loadedModel: string | null = null;

type RequestMessage =
	| { source: 'folio-llm'; id: string; kind: 'load'; model: string }
	| {
			source: 'folio-llm';
			id: string;
			kind: 'generate';
			messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
			options: GenerationOptions;
	  }
	| { source: 'folio-llm'; id: string; kind: 'abort' | 'ping' };

function reply(client: Client | ServiceWorker | MessagePort | null, message: object): void {
	client?.postMessage({ source: 'folio-llm', ...message });
}

async function load(
	client: Client | ServiceWorker | MessagePort | null,
	id: string,
	model: string
): Promise<void> {
	const onProgress = (report: { progress: number; text: string }) =>
		reply(client, { id, kind: 'progress', progress: report.progress, text: report.text });
	if (engine && loadedModel === model) {
		onProgress({ progress: 1, text: 'Model already loaded' });
		return;
	}
	if (!engine)
		engine = await CreateMLCEngine(model, {
			appConfig: proxiedAppConfig(sw.location.origin),
			initProgressCallback: onProgress
		});
	else {
		engine.setInitProgressCallback(onProgress);
		await engine.reload(model);
	}
	loadedModel = model;
}

async function generate(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	options: GenerationOptions,
	onDelta: (delta: string) => void
): Promise<GenerationResult> {
	if (!engine) throw new Error('private engine not loaded');
	const started = performance.now();
	let firstTokenAt: number | null = null;
	let completionTokens: number | null = null;
	let text = '';
	const chunks = await engine.chat.completions.create({
		messages,
		stream: true,
		temperature: 0.2,
		max_tokens: options.maxTokens,
		extra_body: { enable_thinking: options.reasoning === 'on' },
		stream_options: { include_usage: true }
	});
	for await (const chunk of chunks) {
		const delta = chunk.choices[0]?.delta?.content ?? '';
		if (delta) {
			firstTokenAt ??= performance.now();
			text += delta;
			onDelta(delta);
		}
		completionTokens = chunk.usage?.completion_tokens ?? completionTokens;
	}
	const finished = performance.now();
	return {
		text,
		ttftMs: firstTokenAt === null ? null : firstTokenAt - started,
		tokensPerSecond:
			completionTokens && firstTokenAt !== null && finished > firstTokenAt
				? completionTokens / ((finished - firstTokenAt) / 1000)
				: null,
		completionTokens
	};
}

sw.addEventListener('install', () => void sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));
sw.addEventListener('message', (event: ExtendableMessageEvent) => {
	const message = event.data as RequestMessage;
	if (!message || message.source !== 'folio-llm') return;
	const client = event.source;
	event.waitUntil(
		(async () => {
			try {
				if (message.kind === 'load') await load(client, message.id, message.model);
				else if (message.kind === 'generate') {
					const result = await generate(message.messages, message.options, (delta) =>
						reply(client, { id: message.id, kind: 'delta', delta })
					);
					reply(client, { id: message.id, kind: 'result', result });
					return;
				} else if (message.kind === 'abort') await engine?.interruptGenerate();
				reply(client, { id: message.id, kind: 'result', result: null });
			} catch (error) {
				reply(client, {
					id: message.id,
					kind: 'error',
					error: error instanceof Error ? error.message : String(error)
				});
			}
		})()
	);
});
