import { describe, expect, it } from 'vitest';
import { analyzeQuestion } from './semantic-frame';
import { contextualClarification } from './clarification';

describe('contextual clarification dimensions', () => {
	it.each([
		['Et lui ?', false, 1, null],
		['Qui est Malik ? Où habite-t-il ?', true, 2, null]
	] as const)('%s', (question, hasConversationContext, documentCount, expected) => {
		expect(
			contextualClarification(question, analyzeQuestion(question), {
				hasConversationContext,
				documentCount
			})
		).toBe(expected);
	});

	it.each([
		['Que s’est-il passé récemment ?', 1],
		['Que dit la dernière version ?', 3],
		['Convertis tous les montants', 2]
	] as const)(
		'answers best-effort instead of guessing a clarification for %s',
		(question, documentCount) => {
			expect(
				contextualClarification(question, analyzeQuestion(question), {
					hasConversationContext: true,
					documentCount
				})
			).toBeNull();
		}
	);

	it('never asks the opaque entity clarification', () => {
		// Regression: "cette fiche de paie" triggered an opaque entity
		// clarification on the first turn with a document attached.
		expect(
			contextualClarification(
				'Quel est le salaire dans cette fiche de paie ?',
				analyzeQuestion('Quel est le salaire dans cette fiche de paie ?'),
				{ hasConversationContext: false, documentCount: 1 }
			)
		).toBeNull();
		expect(
			contextualClarification('Que dit ce dernier ?', analyzeQuestion('Que dit ce dernier ?'), {
				hasConversationContext: false,
				documentCount: 2
			})
		).toBeNull();
	});

	it('never reads a hyphenated inversion clitic as a back-reference', () => {
		// Regression: "AWP accuse-t-il réception … et répond-il ?" asked
		// An entity clarification fired on the first turn — the named subject
		// (AWP) IS the referent; "-t-il"/"-il" is inversion grammar.
		const question =
			'Sous quels délais AWP accuse-t-il réception d’une réclamation écrite et répond-il ?';
		expect(analyzeQuestion(question).referencesPrevious).toBe(false);
		expect(
			contextualClarification(question, analyzeQuestion(question), {
				hasConversationContext: false,
				documentCount: 1
			})
		).toBeNull();
		// A bare subject pronoun with no named subject stays a back-reference.
		expect(analyzeQuestion('Et lui ?').referencesPrevious).toBe(true);
	});

	it('resolves possessives inside self-contained coordinated questions', () => {
		for (const question of [
			'Qui dirige cette société et quel est son identifiant ?',
			'À qui appartient le compte et quel est son numéro ?',
			'Quel est le montant du RAPO ? Et celui du TA ?'
		]) {
			expect(analyzeQuestion(question).referencesPrevious).toBe(false);
			expect(
				contextualClarification(question, analyzeQuestion(question), {
					hasConversationContext: false,
					documentCount: 2
				})
			).toBeNull();
		}
	});

	it('never asks single-or-all-documents with one document attached', () => {
		// Regression: "Combien dois-je payer au total ?" on a single amortization
		// notice asked "one record or across all selected documents?" — with one
		// document there is exactly one possible answer.
		const question = 'Combien dois-je payer au total ?';
		expect(
			contextualClarification(question, analyzeQuestion(question), {
				hasConversationContext: false,
				documentCount: 1
			})
		).toBeNull();
		// Two documents keep the genuine ambiguity.
		expect(
			contextualClarification(question, analyzeQuestion(question), {
				hasConversationContext: false,
				documentCount: 2
			})
		).toBe('scope');
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

describe('scope clarification only when the question names nothing', () => {
	const frame = (question: string) => analyzeQuestion(question);
	const ask = (question: string) =>
		contextualClarification(question, frame(question), {
			hasConversationContext: false,
			documentCount: 2
		});

	it('asks when the question says what to compute but not over what', () => {
		expect(ask('Quel est le montant total ?')).toBe('scope');
	});

	it('stays quiet when the question already named its operands', () => {
		// Measured live: the app spent a turn asking "one record or all selected
		// documents?" about a question that had just listed three named fees.
		expect(ask('Quel est le montant total si on faisait le RAPO, le TA et référé ?')).toBeNull();
	});

	it('treats any named thing as an answer, not only an acronym', () => {
		expect(ask('Quelle est la somme des primes pour Sécuriplus ?')).toBeNull();
	});
});
