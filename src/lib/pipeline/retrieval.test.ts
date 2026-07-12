import { describe, expect, it } from 'vitest';
import { fuseCandidates, queryCoverage, refineCandidates, selectWithNeighbors } from './retrieval';
import { chunkBlocks } from './chunk';
import type { SearchHit } from '$lib/types';

const hit = (chunkId: number, documentId: string, score: number): SearchHit => ({
	chunkId,
	documentId,
	documentName: `${documentId}.pdf`,
	text: `chunk ${chunkId}`,
	page: 1,
	headingPath: null,
	score
});

describe('fuseCandidates', () => {
	it('rewards agreement and keeps raw scores', () => {
		const result = fuseCandidates([hit(1, 'a', 0.8), hit(2, 'a', 0.7)], [hit(2, 'a', -4)]);
		expect(result[0].chunkId).toBe(2);
		expect(result[0].semanticScore).toBe(0.7);
		expect(result[0].lexicalScore).toBe(-4);
	});

	it('never introduces an out-of-scope candidate', () => {
		const result = fuseCandidates([hit(1, 'enabled', 0.8)], [hit(2, 'enabled', -2)]);
		expect(result.every((candidate) => candidate.documentId === 'enabled')).toBe(true);
	});
});

describe('retrieval refinement', () => {
	it('promotes entity coverage over unrelated early-page candidates', () => {
		const early = { ...hit(1, 'scan', 0.9), page: 2, seq: 1, text: 'Expéditeur ACME numéro 7788' };
		const late = {
			...hit(2, 'scan', 0.7),
			page: 23,
			seq: 22,
			text: 'Destinataire JOHN DOE numéro 4242'
		};
		const result = refineCandidates(
			[early, late],
			[late],
			'Qui est le destinataire JOHN DOE ? Quel est son numéro ?',
			2
		);
		expect(result[0].chunkId).toBe(2);
	});

	it('lets the current follow-up outrank identity context', () => {
		const identity = {
			...hit(1, 'lease', 0.9),
			text: 'Madame Claire Dupont, locataire du logement'
		};
		const rent = {
			...hit(2, 'lease', 0.7),
			text: 'Le loyer mensuel est fixé à huit cent cinquante euros hors charges'
		};
		const result = refineCandidates([identity, rent], [rent], 'Quel est son loyer mensuel ?', 2);
		expect(result[0].chunkId).toBe(2);
	});

	it('adds a useful neighbor and removes duplicate same-page passages', () => {
		const anchor = {
			...hit(20, 'scan', 0.03),
			page: 23,
			seq: 20,
			text: 'Destinataire JOHN DOE'
		};
		const neighbor = {
			...hit(21, 'scan', 0),
			page: 23,
			seq: 21,
			text: 'Compte : 4242'
		};
		const duplicate = { ...hit(22, 'scan', 0.02), page: 23, seq: 22, text: anchor.text };
		const result = selectWithNeighbors(
			[anchor, duplicate],
			[neighbor],
			'Quel est le numéro de JOHN DOE ?',
			8
		);
		expect(result.map((item) => item.chunkId)).toContain(21);
		expect(result.filter((item) => item.text === anchor.text)).toHaveLength(1);
	});

	it('weights names and numbers as discriminating terms', () => {
		expect(queryCoverage('numéro JOHN DOE 4242', 'JOHN DOE porte le numéro 4242')).toBeGreaterThan(
			queryCoverage('numéro JOHN DOE 4242', 'numéro expéditeur 7788')
		);
		expect(queryCoverage('Quel numéro ?', 'Numero de compte')).toBeGreaterThan(0);
	});

	it('keeps every scanned page eligible and returns a late recipient fact', () => {
		const chunks = chunkBlocks(
			Array.from({ length: 30 }, (_, index) => ({
				text:
					index === 22
						? 'Destinataire JOHN DOE numéro de compte 4242'
						: index < 4
							? `Expéditeur ACME numéro ${7700 + index}`
							: `Conditions générales section ${index + 1}`,
				page: index + 1,
				charStart: 0,
				charEnd: 80
			})),
			'scan-30-pages.pdf'
		);
		expect(new Set(chunks.map((chunk) => chunk.page)).size).toBe(30);

		const candidates = chunks.map((chunk, index) => ({
			...hit(index + 1, 'scan', 0.9 - index * 0.01),
			page: chunk.page,
			seq: chunk.seq,
			text: chunk.text
		}));
		const late = candidates[22];
		const result = refineCandidates(
			candidates,
			[late],
			'Qui est le destinataire JOHN DOE ? Quel est son numéro de compte ?',
			8
		);
		expect(result.map((item) => item.page)).toContain(23);
		expect(result[0].text).toContain('JOHN DOE');
		expect(result[0].text).not.toContain('Expéditeur');
	});
});
