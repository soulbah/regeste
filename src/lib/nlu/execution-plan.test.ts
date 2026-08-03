import { describe, expect, it } from 'vitest';
import { analyzeQuestion } from './semantic-frame';
import { buildExecutionPlan } from './execution-plan';

describe('execution plan', () => {
	it.each([
		['Quel est le montant de la facture F-102 ?', ['retrieve-focused', 'filter-scope', 'answer']],
		[
			'Compare les contradictions entre tous les contrats',
			['retrieve-diverse', 'filter-scope', 'answer']
		],
		[
			'Combien ai-je envoyé au total ?',
			['retrieve-exhaustive', 'filter-scope', 'aggregate', 'answer']
		],
		['Liste tous les frais', ['retrieve-exhaustive', 'filter-scope', 'list-exhaustive', 'answer']],
		['Confirme que le passeport est absent', ['retrieve-focused', 'answer']]
	] as const)('%s', (question, expected) => {
		const plan = buildExecutionPlan(question, analyzeQuestion(question));
		expect(plan.steps.map((step) => step.kind)).toEqual(expected);
	});
});
