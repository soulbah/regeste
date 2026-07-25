import { normalizeForFuzzy } from './fuzzy';

export interface QueryEmbeddingBatch {
	data: Float32Array;
	dims: number;
	model: string;
}

type EmbedQueries = (texts: string[]) => Promise<QueryEmbeddingBatch>;

/** Small session-local LRU. Semantic routing and retrieval often encode the
 * same normalized question; sharing that vector avoids duplicate inference. */
export class QueryEmbeddingCache {
	private vectors = new Map<string, Float32Array>();
	private profile: { dims: number; model: string } | null = null;

	constructor(private readonly maxEntries = 512) {
		if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('Invalid cache size');
	}

	async embed(texts: string[], run: EmbedQueries): Promise<QueryEmbeddingBatch> {
		if (!texts.length) throw new Error('Cannot embed an empty query list');
		const keys = texts.map(normalizeForFuzzy);
		// The normalized form is the cache key only. What gets encoded is the
		// question the user actually typed: passages are embedded with full French
		// orthography, so sending an accent-stripped, lowercased, punctuation-free
		// query put the two sides of the comparison in different scripts.
		const missing = new Map<string, string>();
		for (let index = 0; index < texts.length; index++) {
			const key = keys[index];
			if (!this.vectors.has(key) && !missing.has(key)) missing.set(key, texts[index]);
		}
		if (missing.size) {
			const missingKeys = [...missing.keys()];
			const result = await run([...missing.values()]);
			if (result.data.length !== missingKeys.length * result.dims) {
				throw new Error('Query embedding batch shape mismatch');
			}
			if (
				this.profile &&
				(this.profile.dims !== result.dims || this.profile.model !== result.model)
			) {
				this.vectors.clear();
			}
			this.profile = { dims: result.dims, model: result.model };
			for (let index = 0; index < missingKeys.length; index++) {
				this.vectors.set(
					missingKeys[index],
					result.data.slice(index * result.dims, (index + 1) * result.dims)
				);
			}
		}
		if (!this.profile) throw new Error('Query embedding profile unavailable');
		const data = new Float32Array(texts.length * this.profile.dims);
		for (let index = 0; index < keys.length; index++) {
			const vector = this.vectors.get(keys[index]);
			if (!vector) throw new Error('Query embedding missing from cache');
			this.vectors.delete(keys[index]);
			this.vectors.set(keys[index], vector);
			data.set(vector, index * this.profile.dims);
		}
		while (this.vectors.size > this.maxEntries) {
			const oldest = this.vectors.keys().next().value as string | undefined;
			if (oldest === undefined) break;
			this.vectors.delete(oldest);
		}
		return { data, ...this.profile };
	}

	clear(): void {
		this.vectors.clear();
		this.profile = null;
	}
}
