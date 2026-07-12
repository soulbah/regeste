import { describe, expect, it } from 'vitest';
import { buildFuzzyStressMatrix } from './fuzzy-stress';

describe('fuzzy truth matrix', () => {
	const matrix = buildFuzzyStressMatrix();
	it('contains at least 200 deterministic labelled cases', () => {
		expect(matrix).toHaveLength(300);
		expect(buildFuzzyStressMatrix()).toEqual(matrix);
		expect(new Set(matrix.map((item) => item.id)).size).toBe(matrix.length);
	});
	it('meets exact, structure, multi-document and absence quotas', () => {
		for (const scenario of ['exact', 'structure', 'multi-document', 'absence'] as const)
			expect(matrix.filter((item) => item.scenario === scenario).length).toBeGreaterThanOrEqual(30);
		expect(matrix.filter((item) => item.answerable).every((item) => item.locators.length)).toBe(
			true
		);
	});
	it('covers every adversarial category with positives and hard negatives', () => {
		for (const category of new Set(matrix.map((item) => item.category))) {
			const cases = matrix.filter((item) => item.category === category);
			expect(cases.some((item) => item.answerable)).toBe(true);
			expect(cases.some((item) => !item.answerable)).toBe(true);
			expect(
				cases
					.filter((item) => item.answerable)
					.every((item) => item.expectedDocumentIds.length && item.evidence.length)
			).toBe(true);
		}
	});
});
