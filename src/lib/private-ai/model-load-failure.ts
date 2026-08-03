export type ModelLoadFailure = 'storage' | 'memory' | 'transient';

/**
 * Classify only browser/engine failures that carry real evidence.
 * Unknown transport, timeout and worker failures stay transient: silently
 * switching model after one would restart a multi-gigabyte download and falsely
 * tell the reader their device lacked memory.
 */
export function classifyModelLoadFailure(error: unknown): ModelLoadFailure {
	const name = error instanceof Error ? error.name : '';
	const message = error instanceof Error ? error.message : String(error);

	if (
		name === 'QuotaExceededError' ||
		/quota (?:has been )?exceeded|storage quota|not enough storage/i.test(message)
	)
		return 'storage';

	if (
		name === 'GPUOutOfMemoryError' ||
		/out[ -]of[ -](?:device )?memory|cannot allocate memory|allocation failed/i.test(message)
	)
		return 'memory';

	return 'transient';
}
