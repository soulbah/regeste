/// <reference lib="webworker" />
// wllama (llama.cpp WASM) engine in a dedicated worker — the CPU Lite tier
// (spec 018) for machines without usable WebGPU. Multithreaded through
// SharedArrayBuffer (COOP/COEP). Same Comlink surface as llm-worker.ts, so
// llm.svelte.ts can drive either engine. Network use: the one-time GGUF
// download, cached by wllama — never user content.

import { expose } from 'comlink';
// The package ships no "exports"/"types" fields; the deep ESM path resolves
// to the built js + adjacent .d.ts (importing the root pulls its raw src/*.ts
// into svelte-check).
import { Wllama } from '@wllama/wllama/esm/index.js';
import wllamaWasmUrl from '@wllama/wllama/esm/wasm/wllama.wasm?url';

// wllama resolves asset paths with `new URL(path, document.baseURI)` and
// workers have no `document` — shim just what it reads. Worker-local, so it
// can't leak anywhere else.
(self as unknown as { document: { baseURI: string } }).document ??= {
	baseURI: self.location.href
};

let wllama: Wllama | null = null;
let loadedModel: string | null = null;
let aborter: AbortController | null = null;

async function load(modelUrl: string, onProgress?: (progress: number, text: string) => void) {
	if (wllama && loadedModel === modelUrl) return;
	if (wllama) {
		await wllama.exit();
		wllama = null;
	}
	// wllama resolves relative asset paths against `document`, which does not
	// exist in a worker — hand it a fully absolute URL.
	const absoluteWasmUrl = new URL(wllamaWasmUrl, self.location.href).href;
	wllama = new Wllama({ default: absoluteWasmUrl }, { suppressNativeLog: true });
	await wllama.loadModelFromUrl(modelUrl, {
		n_ctx: 4096,
		useCache: true,
		progressCallback: ({ loaded, total }) => {
			onProgress?.(total > 0 ? loaded / total : 0, '');
		}
	});
	loadedModel = modelUrl;
}

async function generate(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	onDelta?: (delta: string) => void
): Promise<string> {
	if (!wllama) throw new Error('engine not loaded');
	aborter = new AbortController();
	let full = '';
	try {
		const chunks = await wllama.createChatCompletion({
			messages,
			stream: true,
			abortSignal: aborter.signal,
			temperature: 0.2,
			max_tokens: 700,
			// Qwen3 thinks by default; grounded QA doesn't need it and CPU
			// tokens are expensive. stripThink upstream catches any leak.
			chat_template_kwargs: { enable_thinking: false }
		});
		for await (const chunk of chunks) {
			const delta = chunk.choices[0]?.delta?.content ?? '';
			if (delta) {
				full += delta;
				onDelta?.(delta);
			}
		}
	} catch (err) {
		// Abort is a normal stop, not a failure.
		if ((err as Error).name !== 'WllamaAbortError' && (err as Error).name !== 'AbortError') {
			throw err;
		}
	} finally {
		aborter = null;
	}
	return full;
}

async function abort() {
	aborter?.abort();
}

const api = { load, generate, abort };
export type WllamaApi = typeof api;

expose(api);
