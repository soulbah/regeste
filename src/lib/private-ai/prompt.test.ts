import { describe, expect, it } from 'vitest';
import {
	buildUserPrompt,
	compactCitationMarkers,
	resolveCitations,
	resolveTargetedCitations
} from './prompt';
import type { SearchHit } from '$lib/types';

const hit = (n: number): SearchHit => ({
	chunkId: n,
	documentId: 'd',
	documentName: 'Contract.pdf',
	text: `Excerpt ${n}`,
	page: n,
	headingPath: null,
	score: 0.03
});

describe('buildUserPrompt', () => {
	it('numbers excerpts with locators', () => {
		const p = buildUserPrompt('Q?', [hit(1), hit(2)]);
		expect(p).toContain('[1] (Contract.pdf · page 1)');
		expect(p).toContain('[2] (Contract.pdf · page 2)');
		expect(p.endsWith('Question: Q?')).toBe(true);
	});

	it('labels prior conversation as context rather than evidence', () => {
		const p = buildUserPrompt('Quel est son numéro ?', [hit(1)], 'Previous answer: JOHN DOE');
		expect(p).toContain('reference resolution only, not a source');
		expect(p).toContain('Previous answer: JOHN DOE');
	});

	it('pins the requested financial role without enumerating surface phrasings', () => {
		const p = buildUserPrompt('Combien ai-je envoyé pour la transaction T-123 ?', [hit(1)]);
		expect(p).toContain('Requested financial role: sent.');
		expect(p).toContain('do not substitute sent, received, fees, tax, subtotal, or total/debited');
	});
});

describe('stripThink / isThinking', () => {
	it('removes closed think blocks', async () => {
		const { stripThink } = await import('./prompt');
		expect(stripThink('<think>reasoning here</think>The answer [1].')).toBe('The answer [1].');
	});

	it('hides an unclosed block and reports thinking state', async () => {
		const { stripThink, isThinking } = await import('./prompt');
		expect(stripThink('<think>still reason')).toBe('');
		expect(isThinking('<think>still reason')).toBe(true);
		expect(isThinking('<think>done</think> answer')).toBe(false);
	});
});

describe('resolveCitations', () => {
	it('keeps valid markers and collects citations once', () => {
		const { text, citations } = resolveCitations('Notice is 3 months [1]. See also [1][2].', [
			hit(1),
			hit(2)
		]);
		expect(text).toBe('Notice is 3 months [1]. See also [1][2].');
		expect(citations.map((c) => c.n)).toEqual([1, 2]);
	});

	it('drops hallucinated markers outside the retrieved range', () => {
		const { text, citations } = resolveCitations('Stated in [7]. Real one [2].', [hit(1), hit(2)]);
		expect(text).toBe('Stated in . Real one [1].');
		expect(citations.map((c) => c.n)).toEqual([1]);
		expect(citations[0].hit).toEqual(hit(2));
	});

	it('compacts sparse markers so answer chips and stored source rows stay aligned', () => {
		const { text, citations } = resolveCitations('Les parties sont Alice et Bob [2][3].', [
			hit(1),
			hit(2),
			hit(3)
		]);
		expect(text).toBe('Les parties sont Alice et Bob [1][2].');
		expect(citations.map((c) => [c.n, c.hit.chunkId])).toEqual([
			[1, 2],
			[2, 3]
		]);
	});

	it('repairs sparse markers in already persisted answers', () => {
		expect(compactCitationMarkers('Alice et Bob [2][3].', 2)).toBe('Alice et Bob [1][2].');
		expect(compactCitationMarkers('Unchanged [1][2].', 2)).toBe('Unchanged [1][2].');
	});

	it('rebinds a short factual answer to the passage supporting its actual names', () => {
		const irrelevant = { ...hit(1), text: 'Diagnostic plomb et amiante', page: 11 };
		const parties = {
			...hit(2),
			text: 'Vendeurs Cédric MARTIN et Hélène DUPUIS. Acquéreur Idrissa KONATÉ.',
			page: 1
		};
		const result = resolveTargetedCitations(
			'Cédric MARTIN et Hélène DUPUIS sont vendeurs, Idrissa KONATÉ est acquéreur [1].',
			[irrelevant, parties],
			'Qui sont les parties prenantes ?'
		);
		expect(result.text).toContain('[1]');
		expect(result.citations[0].hit.page).toBe(1);
	});

	it('preserves separate citations for coordinated multi-fact questions', () => {
		const price = { ...hit(1), text: 'Prix de vente 146 000 euros', page: 3 };
		const loan = { ...hit(2), text: 'Montant du prêt 146 000 euros', page: 19 };
		const result = resolveTargetedCitations(
			'Le prix est 146 000 € [1] et le prêt est 146 000 € [2].',
			[price, loan],
			'Quel est le prix et quel est le prêt ?'
		);
		expect(result.citations.map((citation) => citation.hit.page)).toEqual([3, 19]);
		expect(result.text).toContain('[1] et');
		expect(result.text).toContain('[2]');
	});

	it('passes through text with no markers', () => {
		const { text, citations } = resolveCitations('No idea.', [hit(1)]);
		expect(text).toBe('No idea.');
		expect(citations).toEqual([]);
	});
});
