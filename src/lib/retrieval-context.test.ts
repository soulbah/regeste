import { describe, expect, it } from 'vitest';
import { buildRetrievalContext } from './retrieval-context';
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

	it('ignores notices and returns no context before a completed exchange', () => {
		expect(
			buildRetrievalContext(
				[message('user', 'Question'), message('assistant', 'Stopped', 'notice')],
				'Follow-up'
			)
		).toBeNull();
	});
});
