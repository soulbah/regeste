import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './schema';

describe('local retrieval schema', () => {
	it('adds a resumable independent fuzzy index in v11', () => {
		expect(MIGRATIONS).toHaveLength(11);
		const migration = MIGRATIONS[10];
		expect(migration).toContain('retrieval_version');
		expect(migration).toContain('fuzzy_text');
		expect(migration).toContain('chunks_fuzzy_fts');
		expect(migration).toContain("content='chunks'");
		expect(migration).toContain("VALUES('rebuild')");
	});
});
