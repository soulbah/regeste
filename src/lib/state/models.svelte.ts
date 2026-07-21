// Model management (spec 013): what's cached on this device, how big, delete,
// and the "test my device" benchmark. Cache-API only — documents untouched.

import { llmStore } from '$lib/private-ai/llm.svelte';
import { isShellCache } from '$lib/pwa/cache-names';

export interface CachedModel {
	cacheName: string;
	/** Human label: WebLLM weights vs embedding model vs other. */
	label: string;
	bytes: number;
	entries: number;
}

export interface BenchmarkResult {
	tokensPerSecond: number;
	recommendPrivate: boolean;
}

function labelFor(cacheName: string): string {
	const lower = cacheName.toLowerCase();
	if (lower.includes('webllm')) return 'Private AI model (WebLLM)';
	if (lower.includes('transformers')) return 'Document index model (embeddings)';
	return cacheName;
}

class ModelsStore {
	cached = $state<CachedModel[]>([]);
	loading = $state(false);
	benchmarking = $state(false);
	benchmark = $state<BenchmarkResult | null>(null);

	async refresh(): Promise<void> {
		this.loading = true;
		try {
			// The app-shell cache is infrastructure, not a model: listing it here
			// would offer a Delete button that breaks offline startup.
			const names = (await caches.keys()).filter((name) => !isShellCache(name));
			const out: CachedModel[] = [];
			for (const name of names) {
				const cache = await caches.open(name);
				const keys = await cache.keys();
				let bytes = 0;
				for (const req of keys) {
					const res = await cache.match(req);
					const len = res?.headers.get('content-length');
					if (len) bytes += Number(len);
				}
				out.push({ cacheName: name, label: labelFor(name), bytes, entries: keys.length });
			}
			this.cached = out.sort((a, b) => b.bytes - a.bytes);
		} finally {
			this.loading = false;
		}
	}

	async remove(cacheName: string): Promise<void> {
		await caches.delete(cacheName);
		// Deleting Private weights invalidates the "prepared" fast path.
		if (cacheName.toLowerCase().includes('webllm')) {
			localStorage.removeItem('regeste:private-prepared-model');
			llmStore.prepared = false;
			if (llmStore.status === 'ready') location.reload();
		}
		await this.refresh();
	}

	/** M2 — ~50 streamed deltas of a fixed prompt, honest tokens/second. */
	async runBenchmark(): Promise<void> {
		if (llmStore.status !== 'ready' || this.benchmarking) return;
		this.benchmarking = true;
		this.benchmark = null;
		try {
			let count = 0;
			let start = 0;
			await llmStore.generate(
				[
					{ role: 'system', content: 'You are a helpful assistant.' },
					{ role: 'user', content: 'Count upward from one, one number per word, in English.' }
				],
				() => {
					if (count === 0) start = performance.now();
					count++;
					if (count >= 50) llmStore.stop();
				}
			);
			const seconds = (performance.now() - start) / 1000;
			const tps = seconds > 0 ? count / seconds : 0;
			this.benchmark = {
				tokensPerSecond: Math.round(tps * 10) / 10,
				recommendPrivate: tps >= 5
			};
		} finally {
			this.benchmarking = false;
		}
	}
}

export const modelsStore = new ModelsStore();
