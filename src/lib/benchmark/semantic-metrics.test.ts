import { describe, expect, it } from 'vitest';
import { analyzeQuestion } from '$lib/analysis/query-router';
import { buildSemanticStressCorpus } from './semantic-frame-stress';
import { evaluateSemanticFrames } from './semantic-metrics';

describe('semantic benchmark metrics', () => {
	it('reports perfect deterministic quality on the checked corpus', () => {
		const corpus = buildSemanticStressCorpus().filter((test) => test.category !== 'semantic');
		const metrics = evaluateSemanticFrames(
			corpus,
			corpus.map((test) => analyzeQuestion(test.question))
		);
		expect(metrics).toMatchObject({
			routeAccuracy: 1,
			frameExactMatch: 1,
			slotAccuracy: 1,
			clarificationPrecision: 1,
			clarificationRecall: 1,
			invarianceRate: 1
		});
	});
});
