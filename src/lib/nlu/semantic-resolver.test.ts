import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEMANTIC_PROTOTYPES } from './prototypes';
import { normalizeQuestion } from './semantic-frame';
import {
	resetSemanticPrototypeCache,
	resolveQuestion,
	type EmbedQuestions
} from './semantic-resolver';

function fakeEmbed(queryLabel: 'targeted' | 'synthesis' | 'aggregate' | 'oos'): EmbedQuestions {
	return vi.fn(async (texts: string[]) => {
		const dims = 3;
		const vector = (text: string): number[] => {
			const prototype = SEMANTIC_PROTOTYPES.find((item) => normalizeQuestion(item.text) === text);
			const label = prototype?.label ?? queryLabel;
			if (label === 'targeted') return [1, 0, 0];
			if (label === 'synthesis') return [0, 1, 0];
			if (label === 'aggregate') return [0, 0, 1];
			return [0.577, 0.577, 0.577];
		};
		return { data: new Float32Array(texts.flatMap(vector)), dims, model: 'fake' };
	});
}

describe('semantic question resolver', () => {
	beforeEach(resetSemanticPrototypeCache);

	it('does not invoke embeddings for deterministic high-confidence frames', async () => {
		const embed = fakeEmbed('targeted');
		const result = await resolveQuestion('Compare tous les contrats', embed);
		expect(result.route).toBe('synthesis');
		expect(embed).not.toHaveBeenCalled();
	});

	it('fuses confident semantic evidence for a free-form synthesis', async () => {
		const result = await resolveQuestion(
			'Raconte-moi ce qui ressort de ces pièces',
			fakeEmbed('synthesis')
		);
		expect(result).toMatchObject({ route: 'synthesis', source: 'fused', confidence: 'medium' });
	});

	it('rejects low-margin out-of-scope evidence', async () => {
		const result = await resolveQuestion('Écris-moi un haïku', fakeEmbed('oos'));
		expect(result).toMatchObject({ route: 'targeted', source: 'rules', confidence: 'low' });
		expect(result.evidence).toContain('semantic:rejected');
	});

	it('never invents an aggregate operation from semantic similarity alone', async () => {
		const result = await resolveQuestion(
			'Parle-moi globalement de ces documents',
			fakeEmbed('aggregate')
		);
		expect(result.route).toBe('targeted');
	});
});
