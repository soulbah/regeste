/// <reference lib="webworker" />
// Reranking worker: a cross-encoder scores (question, passage) pairs together,
// where the retrieval channels score each side separately and hope the two
// embeddings meet.
//
// That difference is the whole point. Asked "Combien coûtera toute la
// procédure ?", the lexical channel ranked the passage carrying the 1 100 €
// provision 116th of 124: the reader writes "coûtera", the fee schedule writes
// "montant forfaitaire", "provision", "honoraires", and no shared token exists.
// A cross-encoder reads both texts at once and ranks that passage first,
// without anyone having written down that those words are related.

import { expose } from 'comlink';
import {
	AutoModelForSequenceClassification,
	AutoTokenizer,
	env,
	type PreTrainedModel,
	type PreTrainedTokenizer
} from '@huggingface/transformers';

// Cross-origin isolation (COEP) blocks the browser's direct fetch to
// huggingface.co. Route model files through our same-origin /cdn proxy, exactly
// as the embedding worker does.
env.allowLocalModels = false;
env.remoteHost = `${self.location.origin}/cdn/huggingface.co`;

import { RERANK_MODEL, type RerankProfile, type RerankProgress } from './rerank-model';

/** Pairs per forward pass. Larger batches pad every pair to the longest one in
 * the batch, so a single long passage would be paid for by all its neighbours. */
const BATCH_SIZE = 8;
/** The cross-encoder's own limit; a passage longer than this is truncated, and
 * a chunk that long has already lost its coherence for retrieval anyway. */
const MAX_LENGTH = 512;

interface Reranker {
	model: PreTrainedModel;
	tokenizer: PreTrainedTokenizer;
	profile: RerankProfile;
}

let rerankerPromise: Promise<Reranker> | null = null;

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

function reportDownload(onProgress?: (p: RerankProgress) => void) {
	return (info: { status: string; progress?: number }) => {
		if (info.status === 'progress' && typeof info.progress === 'number') {
			onProgress?.({ phase: 'download', progress: info.progress / 100 });
		}
	};
}

async function build(onProgress?: (p: RerankProgress) => void): Promise<Reranker> {
	const progress_callback = reportDownload(onProgress);
	const device = await pickDevice();
	const dtype = device === 'webgpu' ? ('q4f16' as const) : ('int8' as const);
	const [tokenizer, model] = await Promise.all([
		AutoTokenizer.from_pretrained(RERANK_MODEL, { progress_callback }),
		AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, {
			device,
			dtype,
			progress_callback
		})
	]);
	return { model, tokenizer, profile: { model: RERANK_MODEL, device, dtype } };
}

function getReranker(onProgress?: (p: RerankProgress) => void): Promise<Reranker> {
	rerankerPromise ??= build(onProgress).catch((error) => {
		rerankerPromise = null;
		throw error;
	});
	return rerankerPromise;
}

/**
 * Relevance scores in the order the passages were given.
 *
 * Raw logits, not probabilities: the caller only ever sorts by them, and a
 * sigmoid would add a step whose only effect is to make the numbers look like
 * something they are not.
 */
async function score(
	query: string,
	passages: string[],
	onProgress?: (p: RerankProgress) => void
): Promise<number[]> {
	if (!passages.length) return [];
	const { model, tokenizer } = await getReranker(onProgress);
	const scores: number[] = [];
	for (let index = 0; index < passages.length; index += BATCH_SIZE) {
		const batch = passages.slice(index, index + BATCH_SIZE);
		const inputs = await tokenizer(
			batch.map(() => query),
			{ text_pair: batch, padding: true, truncation: true, max_length: MAX_LENGTH }
		);
		const output = await model(inputs);
		for (const row of output.logits.tolist() as number[][]) scores.push(row[0]);
		onProgress?.({
			phase: 'score',
			progress: Math.min(1, (index + batch.length) / passages.length)
		});
	}
	return scores;
}

/** Download and initialise without scoring, so the consent card can show real
 * progress instead of a spinner that means nothing. */
async function prepare(onProgress?: (p: RerankProgress) => void): Promise<RerankProfile> {
	return (await getReranker(onProgress)).profile;
}

const api = { score, prepare };
export type RerankApi = typeof api;

expose(api);
