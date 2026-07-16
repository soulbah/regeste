import type { EmbedProgress } from './embed-model';

export interface EmbeddingBatchResult {
	data: Float32Array;
	dims: number;
	device: string;
	model: string;
}

type EmbedBatch = (
	texts: string[],
	onProgress?: (progress: EmbedProgress) => void
) => Promise<EmbeddingBatchResult>;

type SchedulerWithYield = { yield?: () => Promise<void> };

/** Let input, paint and higher-priority retrieval work run between background batches. */
export async function yieldToMain(): Promise<void> {
	const scheduler = (globalThis as typeof globalThis & { scheduler?: SchedulerWithYield })
		.scheduler;
	if (scheduler?.yield) {
		await scheduler.yield();
		return;
	}
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Start low-priority repair work only when the browser is idle, with a timeout so
 * stale indexes still converge on continuously active pages. */
export async function waitForBackgroundIdle(timeout = 2_000): Promise<void> {
	if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
		await new Promise<void>((resolve) => window.requestIdleCallback(() => resolve(), { timeout }));
		return;
	}
	await yieldToMain();
}

/** Embed a document through bounded worker calls. Queries can enter the worker
 * between calls instead of waiting behind an entire large-document rebuild. */
export async function embedPassagesInBatches(
	texts: string[],
	embedBatch: EmbedBatch,
	onProgress?: (progress: EmbedProgress) => void,
	batchSize = 32,
	yieldTask: () => Promise<void> = yieldToMain
): Promise<EmbeddingBatchResult> {
	if (!texts.length) throw new Error('Cannot embed an empty passage list');
	if (!Number.isInteger(batchSize) || batchSize < 1)
		throw new Error('Invalid embedding batch size');

	const parts: Float32Array[] = [];
	let expectedDims: number | null = null;
	let expectedModel: string | null = null;
	let device = '';

	for (let offset = 0; offset < texts.length; offset += batchSize) {
		const batch = texts.slice(offset, offset + batchSize);
		const result = await embedBatch(batch, (progress) => {
			onProgress?.({
				phase: progress.phase,
				progress: Math.min(1, (offset + progress.progress * batch.length) / texts.length)
			});
		});
		if (result.data.length !== batch.length * result.dims) {
			throw new Error('Embedding batch shape mismatch');
		}
		if (expectedDims !== null && result.dims !== expectedDims) {
			throw new Error('Embedding dimensions changed between batches');
		}
		if (expectedModel !== null && result.model !== expectedModel) {
			throw new Error('Embedding model changed between batches');
		}
		expectedDims = result.dims;
		expectedModel = result.model;
		device = result.device;
		parts.push(result.data);
		if (offset + batch.length < texts.length) await yieldTask();
	}

	const data = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
	let target = 0;
	for (const part of parts) {
		data.set(part, target);
		target += part.length;
	}
	return { data, dims: expectedDims!, device, model: expectedModel! };
}
