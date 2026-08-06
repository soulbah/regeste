// `for await (const chunk of stream)` on a ReadableStream, everywhere.
//
// Async iteration of a ReadableStream is part of the Streams standard, and
// every engine but WebKit ships it: Firefox since 110, Chromium since 124,
// Safari still not (bug 194379). On Safari the syntax therefore throws
// `TypeError: undefined is not a function (near '...e of t...')` — the
// JavaScriptCore wording for "this object has no Symbol.asyncIterator".
//
// This is not a style problem we could avoid by writing the loop differently:
// pdf.js iterates its own text stream that way inside `getTextContent()`, so
// EVERY PDF failed to parse on Safari, born-digital and scanned alike, with an
// error thrown from a dependency we do not control.
//
// Feature-detected and idempotent: on an engine that has it, this is a no-op.
// Import it before the first module that may iterate a stream — on the main
// thread and inside every worker, because a polyfill installed on one global
// is invisible to the others.

interface AsyncIterableStream<R> {
	getReader(): ReadableStreamDefaultReader<R>;
}

export function installStreamAsyncIterator(): void {
	if (typeof ReadableStream === 'undefined') return;
	const prototype = ReadableStream.prototype as ReadableStream & {
		[Symbol.asyncIterator]?: unknown;
		values?: unknown;
	};
	if (typeof prototype[Symbol.asyncIterator] === 'function') return;

	// The spec's own algorithm: one reader for the whole iteration, released on
	// completion, error, and early exit (`break`, `return`, `throw`). Skipping
	// the release would leave the stream permanently locked after a `break`.
	function values<R>(
		this: AsyncIterableStream<R>,
		{ preventCancel = false }: { preventCancel?: boolean } = {}
	): AsyncIterableIterator<R> {
		const reader = this.getReader();
		return {
			async next(): Promise<IteratorResult<R>> {
				try {
					const result = await reader.read();
					if (result.done) reader.releaseLock();
					return result.done
						? { done: true, value: undefined }
						: { done: false, value: result.value };
				} catch (error) {
					reader.releaseLock();
					throw error;
				}
			},
			async return(value?: unknown): Promise<IteratorResult<R>> {
				if (preventCancel) {
					reader.releaseLock();
				} else {
					// Cancel first, then release: releasing while the cancel is in
					// flight makes the stream reject the request.
					const cancelled = reader.cancel(value);
					reader.releaseLock();
					await cancelled;
				}
				return { done: true, value: value as R };
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	}

	if (typeof prototype.values !== 'function') {
		Object.defineProperty(prototype, 'values', {
			value: values,
			writable: true,
			configurable: true
		});
	}
	Object.defineProperty(prototype, Symbol.asyncIterator, {
		value: prototype.values,
		writable: true,
		configurable: true
	});
}
