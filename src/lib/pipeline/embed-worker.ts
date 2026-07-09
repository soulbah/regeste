/// <reference lib="webworker" />
// Embedding worker: transformers.js singleton running multilingual-e5-small
// (q8, 384 dims) on WebGPU when available, WASM otherwise. Model files are
// downloaded once and cached by the library (Cache API). e5 requires
// "query: " / "passage: " prefixes — enforced here so callers can't forget.

import { expose } from 'comlink';
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBEDDING_MODEL, type EmbedProgress } from './embed-model';

const BATCH_SIZE = 16;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let device: 'webgpu' | 'wasm' = 'wasm';

/** The API existing is not enough — headless/VM Chromium exposes navigator.gpu
 * with no usable adapter. Probe for a real one, fall back to WASM. */
async function pickDevice(): Promise<'webgpu' | 'wasm'> {
	try {
		const adapter = 'gpu' in navigator ? await navigator.gpu?.requestAdapter() : null;
		return adapter ? 'webgpu' : 'wasm';
	} catch {
		return 'wasm';
	}
}

function buildExtractor(
	dev: 'webgpu' | 'wasm',
	onProgress?: (p: EmbedProgress) => void
): Promise<FeatureExtractionPipeline> {
	return pipeline('feature-extraction', EMBEDDING_MODEL, {
		dtype: 'q8',
		device: dev,
		progress_callback: (info: { status: string; progress?: number }) => {
			if (info.status === 'progress' && typeof info.progress === 'number') {
				onProgress?.({ phase: 'download', progress: info.progress / 100 });
			}
		}
	}) as Promise<FeatureExtractionPipeline>;
}

function getExtractor(onProgress?: (p: EmbedProgress) => void): Promise<FeatureExtractionPipeline> {
	if (!extractorPromise) {
		extractorPromise = (async () => {
			device = await pickDevice();
			try {
				return await buildExtractor(device, onProgress);
			} catch (err) {
				if (device === 'wasm') throw err;
				// Adapter probe passed but the backend still failed — WASM rescue.
				console.warn('[folio] webgpu embeddings failed, falling back to wasm:', err);
				device = 'wasm';
				return await buildExtractor('wasm', onProgress);
			}
		})().catch((err) => {
			extractorPromise = null;
			throw err;
		});
	}
	return extractorPromise;
}

async function embed(
	texts: string[],
	kind: 'passage' | 'query',
	onProgress?: (p: EmbedProgress) => void
): Promise<{ data: Float32Array; dims: number; device: string }> {
	const extractor = await getExtractor(onProgress);
	const prefixed = texts.map((t) => `${kind}: ${t}`);
	const out: Float32Array[] = [];
	let dims = 0;
	for (let i = 0; i < prefixed.length; i += BATCH_SIZE) {
		const batch = prefixed.slice(i, i + BATCH_SIZE);
		const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
		dims = tensor.dims[tensor.dims.length - 1];
		out.push(tensor.data.slice(0) as Float32Array);
		tensor.dispose();
		onProgress?.({ phase: 'embed', progress: Math.min(1, (i + batch.length) / prefixed.length) });
	}
	const total = out.reduce((n, a) => n + a.length, 0);
	const data = new Float32Array(total);
	let off = 0;
	for (const a of out) {
		data.set(a, off);
		off += a.length;
	}
	return { data, dims, device };
}

const api = { embed };
export type EmbedApi = typeof api;

expose(api);
