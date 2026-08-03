import { describe, expect, it } from 'vitest';
import { classifyModelLoadFailure } from './model-load-failure';

function namedError(name: string, message: string): Error {
	const error = new Error(message);
	error.name = name;
	return error;
}

describe('model load failure classification', () => {
	it('recognises browser storage exhaustion', () => {
		expect(classifyModelLoadFailure(namedError('QuotaExceededError', 'write failed'))).toBe(
			'storage'
		);
		expect(classifyModelLoadFailure(new Error('storage quota has been exceeded'))).toBe('storage');
	});

	it('recognises explicit engine memory failures', () => {
		expect(
			classifyModelLoadFailure(namedError('GPUOutOfMemoryError', 'GPU allocation failed'))
		).toBe('memory');
		expect(classifyModelLoadFailure(new Error('RuntimeError: out of memory'))).toBe('memory');
	});

	it('keeps timeout, network, cache and generic device-loss failures transient', () => {
		expect(classifyModelLoadFailure(namedError('ActivityTimeoutError', 'no progress'))).toBe(
			'transient'
		);
		expect(classifyModelLoadFailure(new TypeError('Failed to fetch'))).toBe('transient');
		expect(classifyModelLoadFailure(namedError('DeviceLostError', 'GPU device lost'))).toBe(
			'transient'
		);
		expect(
			classifyModelLoadFailure(new Error("Failed to execute 'add' on 'Cache': internal error"))
		).toBe('transient');
		expect(classifyModelLoadFailure(new Error('worker restarted'))).toBe('transient');
	});
});
