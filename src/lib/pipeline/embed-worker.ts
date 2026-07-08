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

function getExtractor(onProgress?: (p: EmbedProgress) => void): Promise<FeatureExtractionPipeline> {
	if (!extractorPromise) {
		device = 'gpu' in navigator && navigator.gpu ? 'webgpu' : 'wasm';
		extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL, {
			dtype: 'q8',
			device,
			progress_callback: (info: { status: string; progress?: number }) => {
				if (info.status === 'progress' && typeof info.progress === 'number') {
					onProgress?.({ phase: 'download', progress: info.progress / 100 });
				}
			}
		}).catch((err) => {
			extractorPromise = null;
			throw err;
		}) as Promise<FeatureExtractionPipeline>;
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
