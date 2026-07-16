import { describe, expect, it } from 'vitest';
import { MARTIN_STRESS_CASES, runMartinStress } from './compromis-stress';
import type { SearchHit } from '$lib/types';

function hit(page: number, text: string): SearchHit {
	return {
		chunkId: page,
		documentId: 'compromis',
		documentName: 'Compromis Martin.pdf',
		page,
		headingPath: null,
		score: 0.03,
		text
	};
}

describe('Martin visual-ground-truth stress matrix', () => {
	it('covers facts, multi-part questions, perturbations and honest negatives', () => {
		expect(MARTIN_STRESS_CASES.length).toBeGreaterThanOrEqual(40);
		expect(MARTIN_STRESS_CASES.filter((test) => !test.answerable).length).toBeGreaterThanOrEqual(
			2
		);
		expect(MARTIN_STRESS_CASES.some((test) => test.pageGroups.length > 1)).toBe(true);
		expect(MARTIN_STRESS_CASES.some((test) => /prxi|contnence/i.test(test.question))).toBe(true);
	});

	it('fails missing pages and unsupported answers', async () => {
		const report = await runMartinStress({
			documentId: 'compromis',
			retrieve: async (question) => {
				if (question === 'Les deux montants de 1 000 euros couvrent-ils la même chose ?')
					return [hit(10, 'Une provision pour frais de 1 000 euros est versée.')];
				if (question === 'Quel est le numéro de passeport de Cédric Martin ?')
					return [hit(1, 'Monsieur Cédric Martin est vendeur.')];
				return [];
			}
		});
		expect(report.score).toBeLessThan(1);
		expect(report.failures.some((failure) => failure.id === 'two-thousands')).toBe(true);
	});
});
