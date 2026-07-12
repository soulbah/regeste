import { describe, expect, it } from 'vitest';
import { parseRelatedQuestions } from './related-questions';

describe('parseRelatedQuestions', () => {
	it('deduplicates and bounds model suggestions', () => {
		expect(
			parseRelatedQuestions(
				'1. Quels sont les détails ?\n- Quels sont les détails ?\n2) Quelle est la date ?\n* Qui est bénéficiaire ?\nQuestion ignorée en quatrième position ?'
			)
		).toEqual(['Quels sont les détails ?', 'Quelle est la date ?', 'Qui est bénéficiaire ?']);
	});
});
