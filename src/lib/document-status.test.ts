import { describe, expect, it } from 'vitest';
import { documentStatusKey } from './document-status';

describe('documentStatusKey', () => {
	it('uses normal ingest phases for scanned-page work', () => {
		expect(documentStatusKey('parsing')).toBe('status.reading');
		expect(documentStatusKey('scanned')).toBe('status.reading');
		expect(documentStatusKey('ocr')).toBe('status.reading');
	});

	it('keeps every named phase and hides internal error codes', () => {
		expect(documentStatusKey('received')).toBe('status.received');
		expect(documentStatusKey('chunking')).toBe('status.splitting');
		expect(documentStatusKey('embedding')).toBe('status.indexing');
		expect(documentStatusKey('ready')).toBe('status.ready');
		expect(documentStatusKey('error', 'scanned_pdf')).toBe('status.failed');
	});

	it('does not call a missing original a failure', () => {
		// The index is intact and still answers; only the source copy is gone.
		// Saying "Failed" sends people to re-import a document that works.
		expect(documentStatusKey('error', 'original_missing')).toBe('status.originalMissing');
		expect(documentStatusKey('error', 'parse_failed')).toBe('status.failed');
	});
});
