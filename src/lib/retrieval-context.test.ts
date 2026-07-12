import { describe, expect, it } from 'vitest';
import { buildRetrievalContext, needsRetrievalContext } from './retrieval-context';
import type { LocalMessage } from '$lib/types';

const message = (
	role: 'user' | 'assistant',
	content: string,
	mode: LocalMessage['mode'] = role === 'assistant' ? 'private' : null
): LocalMessage => ({
	id: crypto.randomUUID(),
	chatId: 'chat',
	role,
	content,
	mode,
	createdAt: Date.now()
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

	it('keeps elliptical follow-ups', () => {
		expect(needsRetrievalContext('Et son prix ?')).toBe(true);
		expect(needsRetrievalContext('Quel est le numéro de ce destinataire ?')).toBe(true);
		expect(needsRetrievalContext('What about their address?')).toBe(true);
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
