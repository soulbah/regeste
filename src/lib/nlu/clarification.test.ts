import { describe, expect, it } from 'vitest';
import { analyzeQuestion } from './semantic-frame';
import { contextualClarification } from './clarification';

describe('contextual clarification dimensions', () => {
	it.each([
		['Et lui ?', false, 1, 'entity'],
		['Que s’est-il passé récemment ?', true, 1, 'time'],
		['Que dit la dernière version ?', true, 3, 'document'],
		['Convertis tous les montants', true, 2, 'unit_currency'],
		['Qui est Malik ? Où habite-t-il ?', true, 2, 'multi_part']
	] as const)('%s', (question, hasConversationContext, documentCount, expected) => {
		expect(
			contextualClarification(question, analyzeQuestion(question), {
				hasConversationContext,
				documentCount
			})
		).toBe(expected);
	});

	it('does not clarify resolved follow-up or one selected document', () => {
		expect(
			contextualClarification('Et ses frais ?', analyzeQuestion('Et ses frais ?'), {
				hasConversationContext: true,
				documentCount: 1
			})
		).toBeNull();
		expect(
			contextualClarification(
				'Que dit la dernière version ?',
				analyzeQuestion('Que dit la dernière version ?'),
				{ hasConversationContext: true, documentCount: 1 }
			)
		).toBeNull();
	});
});
