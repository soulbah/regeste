/// <reference lib="webworker" />
// WebLLM engine in a dedicated worker: model download (cached by WebLLM in
// the Cache API), streamed chat completion, abort. Nothing here ever touches
// the network except the model CDN download — never user content.

import { expose } from 'comlink';
import { CreateMLCEngine, type MLCEngineInterface, type InitProgressReport } from '@mlc-ai/web-llm';
import { proxiedAppConfig } from './webllm-config';
import type { GenerationOptions, GenerationResult } from './generation';

let engine: MLCEngineInterface | null = null;
let loadedModel: string | null = null;

async function load(model: string, onProgress?: (progress: number, text: string) => void) {
	if (engine && loadedModel === model) return;
	if (engine) {
		await engine.unload();
		engine = null;
	}
	engine = await CreateMLCEngine(model, {
		appConfig: proxiedAppConfig(self.location.origin),
		initProgressCallback: (report: InitProgressReport) => {
			onProgress?.(report.progress, report.text);
		}
	});
	loadedModel = model;
}

async function generate(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	onDelta?: (delta: string) => void,
	options: GenerationOptions = { reasoning: 'off', maxTokens: 320 }
): Promise<GenerationResult> {
	if (!engine) throw new Error('engine not loaded');
	const started = performance.now();
	let firstTokenAt: number | null = null;
	let completionTokens: number | null = null;
	let grammarInitMs: number | null = null;
	let grammarPerTokenMs: number | null = null;
	const chunks = await engine.chat.completions.create({
		messages,
		stream: true,
		temperature: options.temperature ?? 0.2,
		// Grounded QA runs at temperature 0, which is greedy decoding — the most
		// loop-prone setting there is. Once a line's tokens are the likeliest
		// continuation they stay the likeliest, and the model emits it again.
		// Measured live: twelve identical rows, then the same two sentences
		// twelve times, an answer that took 86 seconds and never terminated.
		// A mild penalty breaks the fixed point without touching a first answer.
		frequency_penalty: 0.3,
		max_tokens: options.maxTokens,
		extra_body: { enable_thinking: options.reasoning === 'on' },
		// XGrammar compiles the string with `root` as its entry rule, the same
		// name llama.cpp uses, so `answer-grammar.ts` emits one grammar for both.
		...(options.grammar
			? { response_format: { type: 'grammar' as const, grammar: options.grammar } }
			: {}),
		stream_options: { include_usage: true }
	});
	let full = '';
	for await (const chunk of chunks) {
		const delta = chunk.choices[0]?.delta?.content ?? '';
		if (delta) {
			firstTokenAt ??= performance.now();
			full += delta;
			onDelta?.(delta);
		}
		completionTokens = chunk.usage?.completion_tokens ?? completionTokens;
		grammarInitMs = chunk.usage?.extra.grammar_init_s
			? chunk.usage.extra.grammar_init_s * 1000
			: grammarInitMs;
		grammarPerTokenMs = chunk.usage?.extra.grammar_per_token_s
			? chunk.usage.extra.grammar_per_token_s * 1000
			: grammarPerTokenMs;
	}
	const finished = performance.now();
	return {
		text: full,
		ttftMs: firstTokenAt === null ? null : firstTokenAt - started,
		tokensPerSecond:
			completionTokens && firstTokenAt !== null && finished > firstTokenAt
				? completionTokens / ((finished - firstTokenAt) / 1000)
				: null,
		completionTokens,
		grammarInitMs,
		grammarPerTokenMs
	};
}

async function abort() {
	await engine?.interruptGenerate();
}

const api = { load, generate, abort };
export type LlmApi = typeof api;

expose(api);
