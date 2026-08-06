import type { MessageKey } from '$lib/i18n/index.svelte';
import type { DocumentStatus, IngestErrorCode } from '$lib/types';

/**
 * User-facing ingest phase. OCR stays an implementation detail: scanned pages
 * follow the same Reading -> Splitting -> Preparing -> Ready vocabulary as
 * every other document.
 */
export function documentStatusKey(
	status: DocumentStatus,
	error: IngestErrorCode | null | undefined = null
): MessageKey {
	// A missing original is not a failure of this document: it still answers.
	// Saying "Failed" here sends people to re-import a file that works.
	if (error === 'original_missing') return 'status.originalMissing';
	if (error || status === 'error') return 'status.failed';

	switch (status) {
		case 'received':
			return 'status.received';
		case 'parsing':
		case 'scanned':
		case 'ocr':
			return 'status.reading';
		case 'chunking':
			return 'status.splitting';
		case 'embedding':
			return 'status.indexing';
		case 'ready':
			return 'status.ready';
	}
}
