import { describe, expect, it, vi } from 'vitest';
import { embedPassagesInBatches } from './embed-batches';

describe('embedPassagesInBatches', () => {
	it('preserves vector order and yields between bounded calls', async () => {
		const calls: string[][] = [];
		const yields = vi.fn(async () => {});
		const progress: number[] = [];
		const result = await embedPassagesInBatches(
			['a', 'b', 'c', 'd', 'e'],
			async (texts, onProgress) => {
				calls.push(texts);
				onProgress?.({ phase: 'embed', progress: 1 });
				return {
					data: Float32Array.from(texts.flatMap((text) => [text.charCodeAt(0), 1])),
					dims: 2,
					device: 'wasm',
					model: 'test'
				};
			},
			(value) => progress.push(value.progress),
			2,
			yields
		);

		expect(calls).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
		expect(yields).toHaveBeenCalledTimes(2);
		expect(progress).toEqual([0.4, 0.8, 1]);
		expect(Array.from(result.data)).toEqual([97, 1, 98, 1, 99, 1, 100, 1, 101, 1]);
	});

	it('rejects inconsistent worker output before indexing it', async () => {
		let call = 0;
		await expect(
			embedPassagesInBatches(
				['a', 'b'],
				async () => ({
					data: new Float32Array(++call === 1 ? 2 : 3),
					dims: call === 1 ? 2 : 3,
					device: 'wasm',
					model: 'test'
				}),
				undefined,
				1,
				async () => {}
			)
		).rejects.toThrow('dimensions changed');
	});
});
