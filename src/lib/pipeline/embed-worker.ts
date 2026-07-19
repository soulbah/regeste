/// <reference lib="webworker" />
// Embedding worker: EmbeddingGemma on WebGPU, multilingual-e5-small on WASM.
// Model files are downloaded once and cached by the library (Cache API).

import { expose } from 'comlink';
import {
	AutoModel,
	AutoTokenizer,
	env,
	pipeline,
	type FeatureExtractionPipeline,
	type PreTrainedModel,
	type PreTrainedTokenizer,
	type Tensor
} from '@huggingface/transformers';

// Cross-origin isolation (COEP) blocks the browser's direct fetch to
// huggingface.co. Route model files through our same-origin /cdn proxy so the
// download works on the deployed, isolated origin. Path template unchanged:
// remoteHost + "{model}/resolve/{revision}/{file}".
env.allowLocalModels = false;
env.remoteHost = `${self.location.origin}/cdn/huggingface.co`;
import {
	E5_EMBEDDING_MODEL,
	GEMMA_EMBEDDING_MODEL,
	type EmbedProgress,
	type EmbeddingProfile
} from './embed-model';

const BATCH_SIZE = 16;

type Embedder =
	| { kind: 'e5'; extractor: FeatureExtractionPipeline; profile: EmbeddingProfile }
	| {
			kind: 'gemma';
			model: PreTrainedModel;
			tokenizer: PreTrainedTokenizer;
			profile: EmbeddingProfile;
	  };

let embedderPromise: Promise<Embedder> | null = null;

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

function reportDownload(onProgress?: (p: EmbedProgress) => void) {
	return (info: { status: string; progress?: number }) => {
		if (info.status === 'progress' && typeof info.progress === 'number') {
			onProgress?.({ phase: 'download', progress: info.progress / 100 });
		}
	};
}

function buildE5(onProgress?: (p: EmbedProgress) => void): Promise<FeatureExtractionPipeline> {
	return pipeline('feature-extraction', E5_EMBEDDING_MODEL, {
		dtype: 'q8',
		device: 'wasm',
		progress_callback: reportDownload(onProgress)
	}) as Promise<FeatureExtractionPipeline>;
}

async function buildGemma(onProgress?: (p: EmbedProgress) => void): Promise<Embedder> {
	const progress_callback = reportDownload(onProgress);
	const [tokenizer, model] = await Promise.all([
		AutoTokenizer.from_pretrained(GEMMA_EMBEDDING_MODEL, { progress_callback }),
		AutoModel.from_pretrained(GEMMA_EMBEDDING_MODEL, {
			device: 'webgpu',
			dtype: 'q4',
			progress_callback
		})
	]);
	return {
		kind: 'gemma',
		tokenizer,
		model,
		profile: { model: GEMMA_EMBEDDING_MODEL, dims: 256, device: 'webgpu' }
	};
}

function getEmbedder(onProgress?: (p: EmbedProgress) => void): Promise<Embedder> {
	if (!embedderPromise) {
		embedderPromise = (async (): Promise<Embedder> => {
			if ((await pickDevice()) === 'webgpu') {
				try {
					return await buildGemma(onProgress);
				} catch (err) {
					console.warn('[folio] webgpu embeddings failed, falling back to wasm:', err);
				}
			}
			return {
				kind: 'e5' as const,
				extractor: await buildE5(onProgress),
				profile: { model: E5_EMBEDDING_MODEL, dims: 384, device: 'wasm' as const }
			};
		})().catch((err) => {
			embedderPromise = null;
			throw err;
		});
	}
	return embedderPromise!;
}

function truncateAndNormalize(tensor: Tensor, targetDims: number): Float32Array {
	const sourceDims = tensor.dims[tensor.dims.length - 1];
	const rows = tensor.size / sourceDims;
	const source = tensor.data as Float32Array;
	const data = new Float32Array(rows * targetDims);
	for (let row = 0; row < rows; row++) {
		let norm = 0;
		for (let i = 0; i < targetDims; i++) {
			const value = source[row * sourceDims + i];
			data[row * targetDims + i] = value;
			norm += value * value;
		}
		norm = Math.sqrt(norm) || 1;
		for (let i = 0; i < targetDims; i++) data[row * targetDims + i] /= norm;
	}
	return data;
}

async function runEmbed(
	texts: string[],
	kind: 'passage' | 'query',
	onProgress?: (p: EmbedProgress) => void
): Promise<{ data: Float32Array; dims: number; device: string; model: string }> {
	const embedder = await getEmbedder(onProgress);
	const prefixed = texts.map((t) =>
		embedder.kind === 'gemma'
			? kind === 'query'
				? `task: search result | query: ${t}`
				: `title: none | text: ${t}`
			: `${kind}: ${t}`
	);
	const out: Float32Array[] = [];
	const dims = embedder.profile.dims;
	for (let i = 0; i < prefixed.length; i += BATCH_SIZE) {
		const batch = prefixed.slice(i, i + BATCH_SIZE);
		if (embedder.kind === 'gemma') {
			const inputs = await embedder.tokenizer(batch, {
				padding: true,
				truncation: true,
				max_length: 2048
			});
			const output = (await embedder.model(inputs)) as unknown as { sentence_embedding: Tensor };
			out.push(truncateAndNormalize(output.sentence_embedding, dims));
			output.sentence_embedding.dispose();
		} else {
			const tensor = await embedder.extractor(batch, { pooling: 'mean', normalize: true });
			out.push(tensor.data.slice(0) as Float32Array);
			tensor.dispose();
		}
		onProgress?.({ phase: 'embed', progress: Math.min(1, (i + batch.length) / prefixed.length) });
		// A large benchmark query job can contain hundreds of variants. Yield
		// between model batches so Chromium can service rendering/devtools work;
		// inference remains serialized and the model/session is never duplicated.
		if (i + batch.length < prefixed.length) {
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
	}
	const total = out.reduce((n, a) => n + a.length, 0);
	const data = new Float32Array(total);
	let off = 0;
	for (const a of out) {
		data.set(a, off);
		off += a.length;
	}
	return {
		data,
		dims,
		device: embedder.profile.device,
		model: embedder.profile.model
	};
}

interface EmbedJob {
	texts: string[];
	kind: 'passage' | 'query';
	onProgress?: (p: EmbedProgress) => void;
	resolve: (result: Awaited<ReturnType<typeof runEmbed>>) => void;
	reject: (reason: unknown) => void;
}

const queryJobs: EmbedJob[] = [];
const passageJobs: EmbedJob[] = [];
let draining = false;

async function drainJobs(): Promise<void> {
	if (draining) return;
	draining = true;
	try {
		while (queryJobs.length || passageJobs.length) {
			const job = queryJobs.shift() ?? passageJobs.shift()!;
			try {
				job.resolve(await runEmbed(job.texts, job.kind, job.onProgress));
			} catch (error) {
				job.reject(error);
			}
		}
	} finally {
		draining = false;
	}
}

/** Serialize model inference, but always serve queued user queries before the
 * next low-priority passage batch. This avoids unsafe concurrent model calls. */
function embed(
	texts: string[],
	kind: 'passage' | 'query',
	onProgress?: (p: EmbedProgress) => void
): Promise<Awaited<ReturnType<typeof runEmbed>>> {
	return new Promise((resolve, reject) => {
		const job = { texts, kind, onProgress, resolve, reject };
		(kind === 'query' ? queryJobs : passageJobs).push(job);
		void drainJobs();
	});
}

const api = { embed };
export type EmbedApi = typeof api;

expose(api);
