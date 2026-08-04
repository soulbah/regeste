// Shared between the rerank worker and main-thread callers. Import-safe
// everywhere (the worker module itself calls expose() at top level and must
// only be loaded inside an actual Worker).

// XLM-RoBERTa cross-encoder, Apache-2.0, multilingual.
//
// Chosen over Alibaba's gte-multilingual-reranker-base, which is smaller and
// publishes ONNX weights but declares `model_type: "new"` — a custom
// architecture transformers.js cannot construct, so it throws on load. Jina's
// v2 reranker is cc-by-nc-4.0 and cannot ship in an AGPL product.
export const RERANK_MODEL = 'onnx-community/bge-reranker-v2-m3-ONNX';

export interface RerankProfile {
	model: string;
	device: 'webgpu' | 'wasm';
	dtype: 'q4f16' | 'int8';
}

export interface RerankProgress {
	phase: 'download' | 'score';
	progress: number; // 0..1
}

/**
 * How many fused candidates are worth scoring.
 *
 * A cross-encoder only reorders what the first stage hands it, so the pool is
 * the recall ceiling. Measured on a fee agreement asked "Combien coûtera toute
 * la procédure ?": a pool of 10 contained no passage carrying a fee at all,
 * while 20 contained three, which the reranker then placed first, second and
 * fifth. The pool is where recall is won; the reranker only fixes the order.
 */
export const RERANK_CANDIDATES = 32;

/**
 * How many survive into the prompt.
 *
 * Sending sixteen passages cost ~4 500 tokens of prefill before the model wrote
 * a word. Ranking well enough to send eight is what pays for the reranker's own
 * latency.
 */
export const RERANK_KEEP = 8;
