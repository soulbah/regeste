// Shared between the embed worker and main-thread callers. Import-safe
// everywhere (the worker module itself calls expose() at top level and must
// only be loaded inside an actual Worker).

export const E5_EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';
export const GEMMA_EMBEDDING_MODEL = 'onnx-community/embeddinggemma-300m-ONNX';
// Kept for UI/storage imports that need a stable quality-tier label.
export const EMBEDDING_MODEL = GEMMA_EMBEDDING_MODEL;

export interface EmbeddingProfile {
	model: string;
	dims: 256 | 384;
	device: 'webgpu' | 'wasm';
}

export async function detectEmbeddingProfile(): Promise<EmbeddingProfile> {
	try {
		const adapter = 'gpu' in navigator ? await navigator.gpu?.requestAdapter() : null;
		if (adapter) return { model: GEMMA_EMBEDDING_MODEL, dims: 256, device: 'webgpu' };
	} catch {
		// WASM fallback below.
	}
	return { model: E5_EMBEDDING_MODEL, dims: 384, device: 'wasm' };
}

export interface EmbedProgress {
	phase: 'download' | 'embed';
	progress: number; // 0..1
}
