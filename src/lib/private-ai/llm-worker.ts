/// <reference lib="webworker" />
// WebLLM engine in a dedicated worker: model download (cached by WebLLM in
// the Cache API), streamed chat completion, abort. Nothing here ever touches
// the network except the model CDN download — never user content.

import { expose } from 'comlink';
import { CreateMLCEngine, type MLCEngineInterface, type InitProgressReport } from '@mlc-ai/web-llm';

let engine: MLCEngineInterface | null = null;
let loadedModel: string | null = null;

async function load(model: string, onProgress?: (progress: number, text: string) => void) {
	if (engine && loadedModel === model) return;
	if (engine) {
		await engine.unload();
		engine = null;
	}
	engine = await CreateMLCEngine(model, {
		initProgressCallback: (report: InitProgressReport) => {
			onProgress?.(report.progress, report.text);
		}
	});
	loadedModel = model;
}

async function generate(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	onDelta?: (delta: string) => void
): Promise<string> {
	if (!engine) throw new Error('engine not loaded');
	const chunks = await engine.chat.completions.create({
		messages,
		stream: true,
		temperature: 0.2,
		max_tokens: 700
	});
	let full = '';
	for await (const chunk of chunks) {
		const delta = chunk.choices[0]?.delta?.content ?? '';
		if (delta) {
			full += delta;
			onDelta?.(delta);
		}
	}
	return full;
}

async function abort() {
	await engine?.interruptGenerate();
}

const api = { load, generate, abort };
export type LlmApi = typeof api;

expose(api);
