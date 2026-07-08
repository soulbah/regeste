import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';

describe('sha256Hex', () => {
	it('produces the known digest for "abc"', async () => {
		const bytes = new TextEncoder().encode('abc');
		const buffer = bytes.buffer.slice(0) as ArrayBuffer;
		expect(await sha256Hex(buffer)).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});

	it('is stable and collision-distinct for different content', async () => {
		const a = new TextEncoder().encode('document a').buffer.slice(0) as ArrayBuffer;
		const b = new TextEncoder().encode('document b').buffer.slice(0) as ArrayBuffer;
		expect(await sha256Hex(a)).toBe(await sha256Hex(a));
		expect(await sha256Hex(a)).not.toBe(await sha256Hex(b));
	});
});
