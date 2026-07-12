import { describe, expect, it } from 'vitest';
import {
	CROSS_DOCUMENT_CASES,
	CROSS_DOCUMENT_FIXTURES,
	scoreCrossDocumentEvidence
} from './cross-document-stress';

describe('cross-document adversarial corpus', () => {
	it('covers complementary, multi-hop, identity, negation, stale, conflict and absent evidence', () => {
		expect(new Set(CROSS_DOCUMENT_CASES.map((test) => test.category))).toEqual(
			new Set([
				'complementary',
				'multi-hop',
				'identity',
				'negation',
				'superseded',
				'conflict',
				'exhaustive',
				'absent'
			])
		);
		expect(CROSS_DOCUMENT_CASES.filter((test) => test.relevantDocuments.length > 1).length).toBe(8);
	});

	it('uses fictional identifiers and unique machine-checkable markers', () => {
		expect(CROSS_DOCUMENT_FIXTURES).toHaveLength(9);
		expect(new Set(CROSS_DOCUMENT_FIXTURES.map((fixture) => fixture.marker)).size).toBe(9);
		for (const fixture of CROSS_DOCUMENT_FIXTURES) {
			expect(fixture.content).toContain(fixture.marker);
		}
	});

	it('scores missing evidence and unsupported answers separately', () => {
		const retrieved = CROSS_DOCUMENT_CASES.map((test) => test.relevantDocuments.slice());
		expect(scoreCrossDocumentEvidence(CROSS_DOCUMENT_CASES, retrieved)).toEqual({
			evidenceRecall: 1,
			completeCaseRate: 1,
			absentCasePrecision: 1
		});
		retrieved[0] = [CROSS_DOCUMENT_CASES[0].relevantDocuments[0]];
		retrieved.at(-1)!.push('profil-cr204.md');
		const degraded = scoreCrossDocumentEvidence(CROSS_DOCUMENT_CASES, retrieved);
		expect(degraded.evidenceRecall).toBeLessThan(1);
		expect(degraded.completeCaseRate).toBeLessThan(1);
		expect(degraded.absentCasePrecision).toBe(0);
	});
});
