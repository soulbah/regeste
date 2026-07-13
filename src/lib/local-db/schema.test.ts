import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './schema';

describe('local retrieval schema', () => {
	it('adds a resumable independent fuzzy index in v11', () => {
		expect(MIGRATIONS).toHaveLength(12);
		const migration = MIGRATIONS[10];
		expect(migration).toContain('retrieval_version');
		expect(migration).toContain('fuzzy_text');
		expect(migration).toContain('chunks_fuzzy_fts');
		expect(migration).toContain("content='chunks'");
		expect(migration).toContain("VALUES('rebuild')");
	});

	it('persists OCR confidence separately from source text in v12', () => {
		expect(MIGRATIONS[11]).toContain('ocr_confidence REAL');
	});
});
