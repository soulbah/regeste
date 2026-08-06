import { describe, expect, it } from 'vitest';
import { installStreamAsyncIterator } from './stream-async-iterator';

/** A stream whose prototype has no async iterator, the way WebKit ships it. */
function withoutAsyncIterator<T>(run: () => Promise<T>): Promise<T> {
	const prototype = ReadableStream.prototype as ReadableStream & {
		[Symbol.asyncIterator]?: unknown;
		values?: unknown;
	};
	const iterator = Object.getOwnPropertyDescriptor(prototype, Symbol.asyncIterator);
	const values = Object.getOwnPropertyDescriptor(prototype, 'values');
	// @ts-expect-error deleting an optional prototype method for the test
	delete prototype[Symbol.asyncIterator];
	// @ts-expect-error same
	delete prototype.values;
	return run().finally(() => {
		if (iterator) Object.defineProperty(prototype, Symbol.asyncIterator, iterator);
		if (values) Object.defineProperty(prototype, 'values', values);
	});
}

const of = <T>(...items: T[]) =>
	new ReadableStream<T>({
		start(controller) {
			for (const item of items) controller.enqueue(item);
			controller.close();
		}
	});

describe('installStreamAsyncIterator', () => {
	it('makes a stream iterable where the engine does not', async () => {
		await withoutAsyncIterator(async () => {
			installStreamAsyncIterator();
			const seen: number[] = [];
			for await (const value of of(1, 2, 3)) seen.push(value);
			expect(seen).toEqual([1, 2, 3]);
		});
	});

	it('releases the lock on an early exit, so the stream stays usable', async () => {
		await withoutAsyncIterator(async () => {
			installStreamAsyncIterator();
			const stream = of('a', 'b', 'c');
			for await (const value of stream) {
				expect(value).toBe('a');
				break;
			}
			// A reader left locked here is the failure this guards: the next
			// consumer of the same stream would throw instead of reading.
			expect(stream.locked).toBe(false);
		});
	});

	it('propagates a stream error to the loop', async () => {
		await withoutAsyncIterator(async () => {
			installStreamAsyncIterator();
			const stream = new ReadableStream({
				start(controller) {
					controller.error(new Error('upstream failed'));
				}
			});
			await expect(async () => {
				for await (const value of stream) void value;
			}).rejects.toThrow('upstream failed');
		});
	});

	it('leaves a native implementation alone', () => {
		const before = ReadableStream.prototype[Symbol.asyncIterator];
		installStreamAsyncIterator();
		expect(ReadableStream.prototype[Symbol.asyncIterator]).toBe(before);
	});
});
