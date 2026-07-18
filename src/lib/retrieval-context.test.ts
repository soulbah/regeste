import { describe, expect, it } from 'vitest';
import {
	buildClarificationContext,
	buildRetrievalContext,
	isContestation,
	needsRetrievalContext
} from './retrieval-context';
import type { LocalMessage } from '$lib/types';

const message = (
	role: 'user' | 'assistant',
	content: string,
	mode: LocalMessage['mode'] = role === 'assistant' ? 'private' : null,
	id: string = crypto.randomUUID()
): LocalMessage => ({
	id,
	chatId: 'chat',
	role,
	content,
	mode,
	createdAt: Date.now()
});

describe('buildClarificationContext', () => {
	it('composes the original question with every user-provided slot', () => {
		const messages = [
			message('user', 'Quel est le total ?', null, 'u1'),
			message('assistant', 'Un relevé ou tous les documents ?', 'private', 'a1'),
			message('user', 'Tous les documents sélectionnés', null, 'u2'),
			message('assistant', 'Quel montant faut-il utiliser ?', 'private', 'a2'),
			message('user', 'Les montants envoyés', null, 'u3')
		];
		const context = buildClarificationContext(
			messages,
			'Les montants envoyés',
			new Set(['a1', 'a2'])
		);
		expect(context?.analysisQuery).toBe(
			'Quel est le total ?\nTous les documents sélectionnés\nLes montants envoyés'
		);
	});

	it('does not treat a new full question as a clarification slot answer', () => {
		const current = "C'est quoi le motif de la demande ?";
		const messages = [
			message('user', 'Quel est son métier ?', null, 'u1'),
			message('assistant', 'À quelle partie faut-il répondre en premier ?', 'private', 'a1'),
			message('user', current, null, 'u2')
		];
		expect(buildClarificationContext(messages, current, new Set(['a1']))).toBeNull();
	});

	it('does not treat an unpunctuated interrogative as a slot answer', () => {
		const messages = [
			message('user', 'Quel est le total ?', null, 'u1'),
			message('assistant', 'Un relevé ou tous les documents ?', 'private', 'a1'),
			message('user', 'quel est le motif de la demande', null, 'u2')
		];
		expect(
			buildClarificationContext(messages, 'quel est le motif de la demande', new Set(['a1']))
		).toBeNull();
	});

	it('does not carry an ordinary assistant turn as clarification state', () => {
		const messages = [
			message('user', 'Quel est le total ?', null, 'u1'),
			message('assistant', '42 €', 'private', 'a1'),
			message('user', 'Les montants envoyés', null, 'u2')
		];
		expect(buildClarificationContext(messages, 'Les montants envoyés', new Set())).toBeNull();
	});
});

describe('buildRetrievalContext', () => {
	it('keeps recipient identity for a French follow-up and strips citations', () => {
		const current = 'Quel est son numéro ?';
		const context = buildRetrievalContext(
			[
				message('user', 'Qui est le destinataire ?'),
				message('assistant', 'Le destinataire est JOHN DOE [2].'),
				message('user', current)
			],
			current
		);
		expect(context?.searchQuery).toContain('JOHN DOE');
		expect(context?.searchQuery).toContain('Quel est son numéro ?');
		expect(context?.promptContext).not.toContain('[2]');
	});

	it('keeps recipient identity for an English follow-up', () => {
		const current = 'What is their account number?';
		const context = buildRetrievalContext(
			[
				message('user', 'Who is the recipient?'),
				message('assistant', 'The recipient is JANE SMITH [1].'),
				message('user', current)
			],
			current
		);
		expect(context?.searchQuery).toContain('JANE SMITH');
	});

	it('does not contaminate independent factual questions with the previous answer', () => {
		const messages = [
			message('user', 'Qui sont les parties prenantes ?'),
			message('assistant', 'Les parties sont Alice Martin et Bob Durand [2][3].')
		];
		for (const question of [
			'Quel est le montant du prêt à avoir ?',
			'Quelle est la superficie de la maison ?',
			'Quel est le prix de la maison ?'
		]) {
			expect(needsRetrievalContext(question)).toBe(false);
			expect(buildRetrievalContext([...messages, message('user', question)], question)).toBeNull();
		}
	});

	it('does not mistake French subject-verb inversion for a contextual pronoun', () => {
		expect(
			needsRetrievalContext('La contenance cadastrale est-elle de 76 centiares, soit 76 m² ?')
		).toBe(false);
		expect(needsRetrievalContext('Le prêt a-t-il une garantie ?')).toBe(false);
		expect(needsRetrievalContext('Et elle, quelle est sa superficie ?')).toBe(true);
	});

	it('keeps elliptical follow-ups', () => {
		expect(needsRetrievalContext('Et son prix ?')).toBe(true);
		expect(needsRetrievalContext('Quel est le numéro de ce destinataire ?')).toBe(true);
		expect(needsRetrievalContext('What about their address?')).toBe(true);
	});

	it('puts the current aggregate scope before the referenced question', () => {
		const current = 'Et en mai ?';
		const context = buildRetrievalContext(
			[
				message('user', 'Combien ai-je envoyé en juin ?'),
				message('assistant', 'La somme est 320,00 € [1][2][3].'),
				message('user', current)
			],
			current
		);
		expect(context?.analysisQuery.startsWith('Et en mai ?')).toBe(true);
		expect(context?.analysisQuery).toContain('Combien ai-je envoyé en juin ?');
	});

	it('binds a clarification reply to the original question even without a pronoun', () => {
		const current = 'Tous les documents sélectionnés';
		const context = buildRetrievalContext(
			[
				message('user', 'Quel est le total ?'),
				message(
					'assistant',
					'Faut-il calculer ce montant pour un seul relevé ou pour tous les documents sélectionnés ?'
				),
				message('user', current)
			],
			current,
			true
		);
		expect(context?.analysisQuery).toContain('Quel est le total ?');
		expect(context?.analysisQuery.startsWith(current)).toBe(true);
	});

	it('exposes only the current turn to ambiguity checks on a follow-up', () => {
		// Regression: analysisQuery holds two complete questions, so counting its
		// "?" fired the multi-part clarification on every follow-up.
		const current = 'Quel est son métier ?';
		const context = buildRetrievalContext(
			[
				message('user', "Comment s'appelle la demandeuse ?"),
				message('assistant', "La demandeuse s'appelle Aminata Keita [1]."),
				message('user', current)
			],
			current
		);
		expect(context?.clarificationQuery).toBe(current);
		expect(context?.analysisQuery).toContain('Previous question:');
	});

	it('never uses a clarification prompt as the previous answer', () => {
		const current = 'Quel est son métier ?';
		const context = buildRetrievalContext(
			[
				message('user', "Comment s'appelle la demandeuse ?", null, 'u1'),
				message('assistant', "La demandeuse s'appelle Aminata Keita.", 'private', 'a1'),
				message('user', current, null, 'u2'),
				message('assistant', 'À quelle partie faut-il répondre en premier ?', 'private', 'a2'),
				message('user', current, null, 'u3')
			],
			current,
			false,
			new Set(['a2'])
		);
		expect(context?.previousAnswer).toContain('Aminata');
		expect(context?.previousQuestion).toContain('demandeuse');
	});

	it('recognizes disputes without pronouns and leaves plain turns alone', () => {
		expect(isContestation("Non, l'acompte est beaucoup plus")).toBe(true);
		expect(isContestation("C'est faux, le salaire est net")).toBe(true);
		expect(isContestation('Tu te trompes')).toBe(true);
		expect(isContestation("That's wrong, the deposit is higher")).toBe(true);
		expect(isContestation('Quel est le montant exact ?')).toBe(false);
		expect(isContestation('Le salaire est-il net ou brut ?')).toBe(false);
		// "non" inside a sentence is not a dispute lead.
		expect(isContestation('Le contrat est-il non résiliable ?')).toBe(false);
	});

	it('ignores notices and returns no context before a completed exchange', () => {
		expect(
			buildRetrievalContext(
				[message('user', 'Question'), message('assistant', 'Stopped', 'notice')],
				'Follow-up'
			)
		).toBeNull();
	});
});
