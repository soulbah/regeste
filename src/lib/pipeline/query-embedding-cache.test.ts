import { describe, expect, it, vi } from 'vitest';
import { QueryEmbeddingCache, type QueryEmbeddingBatch } from './query-embedding-cache';

function embedder(dims = 2, model = 'test/model') {
	return vi.fn(async (texts: string[]): Promise<QueryEmbeddingBatch> => ({
		data: new Float32Array(
			texts.flatMap((text, index) => [text.length, index + 1]).slice(0, texts.length * dims)
		),
		dims,
		model
	}));
}

describe('query embedding cache', () => {
	it('shares normalized vectors between routing and retrieval', async () => {
		const cache = new QueryEmbeddingCache();
		const run = embedder();
		const first = await cache.embed(["Combien coûte l'assurance ?"], run);
		const second = await cache.embed(['combien coute l assurance'], run);
		expect(run).toHaveBeenCalledTimes(1);
		expect([...second.data]).toEqual([...first.data]);
	});

	it('embeds only missing unique queries and preserves requested order', async () => {
		const cache = new QueryEmbeddingCache();
		const run = embedder();
		await cache.embed(['alpha'], run);
		const result = await cache.embed(['beta', 'alpha', 'beta'], run);
		expect(run).toHaveBeenLastCalledWith(['beta']);
		expect([...result.data]).toEqual([4, 1, 5, 1, 4, 1]);
	});

	it('evicts old vectors at the configured bound', async () => {
		const cache = new QueryEmbeddingCache(2);
		const run = embedder();
		await cache.embed(['alpha', 'beta'], run);
		await cache.embed(['gamma'], run);
		await cache.embed(['alpha'], run);
		expect(run).toHaveBeenCalledTimes(3);
	});
});
