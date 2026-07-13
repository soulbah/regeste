import { describe, expect, it } from 'vitest';
import { analyzeQuestion } from '$lib/analysis/query-router';
import {
	buildSemanticBenchmarkCorpus,
	buildSemanticStressCorpus,
	splitSemanticStressCorpus
} from './semantic-frame-stress';

describe('semantic frame behavioral stress matrix', () => {
	const corpus = buildSemanticStressCorpus();

	it('contains at least 300 bilingual invariance and hard-negative cases', () => {
		expect(corpus.length).toBeGreaterThanOrEqual(300);
		expect(new Set(corpus.map((item) => item.category))).toEqual(
			new Set(['mft', 'invariance', 'directional', 'hard-negative', 'semantic'])
		);
	});

	it('splits base families without perturbation leakage', () => {
		const { calibration, heldOut } = splitSemanticStressCorpus(buildSemanticBenchmarkCorpus());
		const calibrationBases = new Set(calibration.map((item) => item.baseId));
		const heldOutBases = new Set(heldOut.map((item) => item.baseId));
		expect([...calibrationBases].filter((id) => heldOutBases.has(id))).toEqual([]);
		expect(new Set(heldOut.map((item) => item.locale))).toEqual(new Set(['fr', 'en']));
		expect(new Set(heldOut.map((item) => item.expected.route))).toEqual(
			new Set(['targeted', 'synthesis', 'aggregate'])
		);
		expect(heldOut.some((item) => item.expected.clarification)).toBe(true);
		expect(heldOut.some((item) => item.category === 'hard-negative')).toBe(true);
		expect(heldOut.filter((item) => item.partition === 'heldout')).toHaveLength(12);
	});

	it.each(corpus.filter((test) => test.category !== 'semantic'))(
		'$id',
		({ question, expected }) => {
			const frame = analyzeQuestion(question);
			expect(frame.route).toBe(expected.route);
			if ('operation' in expected) expect(frame.operation).toBe(expected.operation);
			if ('role' in expected) expect(frame.moneyRole).toBe(expected.role);
			if ('scope' in expected) expect(frame.scope.kind).toBe(expected.scope);
			if ('clarification' in expected) expect(frame.clarification).toBe(expected.clarification);
			if ('referencesPrevious' in expected)
				expect(frame.referencesPrevious).toBe(expected.referencesPrevious);
		}
	);
});
