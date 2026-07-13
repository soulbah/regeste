import { describe, expect, it } from 'vitest';
import { assertBenchmarkBounds, validateBenchmarkBytes, type BenchmarkAsset } from './assets';

const hash = async (text: string) => {
	const data = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
};

describe('benchmark asset validation', () => {
	it('accepts registered bytes and rejects same-name HTML or changed content', async () => {
		const text = 'controlled benchmark';
		const asset: BenchmarkAsset = {
			name: 'fixture.txt',
			format: 'txt',
			bytes: text.length,
			sha256: await hash(text)
		};
		await expect(
			validateBenchmarkBytes(asset, new TextEncoder().encode(text).buffer)
		).resolves.toBeUndefined();
		await expect(
			validateBenchmarkBytes(asset, new TextEncoder().encode('<html>fallback</html>').buffer)
		).rejects.toThrow(/Size mismatch|Hash mismatch/);
	});

	it('rejects invalid signatures and page/chunk bounds before scoring', async () => {
		const asset: BenchmarkAsset = {
			name: 'fixture.pdf',
			format: 'pdf',
			bytes: 5,
			sha256: await hash('hello'),
			expectedPages: { min: 2, max: 3 },
			expectedChunks: { min: 4, max: 8 }
		};
		await expect(
			validateBenchmarkBytes(asset, new TextEncoder().encode('hello').buffer)
		).rejects.toThrow('Signature mismatch');
		expect(() => assertBenchmarkBounds(asset, { pages: 1, chunks: 5 })).toThrow(
			'Page bound mismatch'
		);
		expect(() => assertBenchmarkBounds(asset, { pages: 2, chunks: 2 })).toThrow(
			'Chunk bound mismatch'
		);
	});
});
