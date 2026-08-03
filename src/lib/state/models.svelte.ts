// Model management (spec 013): what's cached on this device, how big, delete,
// and the "test my device" benchmark. Cache-API only — documents untouched.

import { llmStore } from '$lib/private-ai/llm.svelte';
import { isShellCache } from '$lib/pwa/cache-names';

export interface CachedModel {
	/** Groups the several caches one model spans. */
	key: string;
	/** i18n key, or the raw cache name for anything unrecognised. */
	label: string;
	cacheNames: string[];
	bytes: number;
	entries: number;
}

export interface BenchmarkResult {
	tokensPerSecond: number;
	recommendPrivate: boolean;
}

/**
 * Which model a cache belongs to.
 *
 * One model is several caches — WebLLM keeps its weights, its wasm and its
 * config apart — and naming each of them after the model printed the same line
 * three times with three Delete buttons, none of which deleted the model. The
 * key groups them; the label is the thing a person thinks they are deleting.
 */
function familyOf(cacheName: string): { key: string; label: string } {
	const lower = cacheName.toLowerCase();
	if (lower.includes('webllm') || lower.includes('wllama'))
		return { key: 'engine', label: 'models.onDevice' };
	if (lower.includes('transformers')) return { key: 'embeddings', label: 'models.index' };
	return { key: cacheName, label: cacheName };
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
			// A plain object, not a Map: this is a local accumulator inside one
			// async pass, never reactive state, and the lint rule that asks for
			// SvelteMap is about the latter.
			const groups: Record<string, CachedModel> = {};
			for (const name of names) {
				const cache = await caches.open(name);
				const keys = await cache.keys();
				let bytes = 0;
				for (const req of keys) {
					const res = await cache.match(req);
					const len = res?.headers.get('content-length');
					if (len) bytes += Number(len);
				}
				const family = familyOf(name);
				const existing = groups[family.key];
				if (existing) {
					existing.bytes += bytes;
					existing.entries += keys.length;
					existing.cacheNames.push(name);
				} else {
					groups[family.key] = {
						key: family.key,
						label: family.label,
						cacheNames: [name],
						bytes,
						entries: keys.length
					};
				}
			}
			this.cached = Object.values(groups).sort((a, b) => b.bytes - a.bytes);
		} finally {
			this.loading = false;
		}
	}

	/** Delete every cache a model spans. Deleting one of the three and leaving
	 * the others is not what anyone means by removing a model. */
	async remove(model: CachedModel): Promise<void> {
		for (const name of model.cacheNames) await caches.delete(name);
		// Losing the weights invalidates the "already prepared" fast path.
		if (model.key === 'engine') {
			localStorage.removeItem('regeste:private-prepared-model');
			localStorage.removeItem('regeste:private-consented-model');
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
