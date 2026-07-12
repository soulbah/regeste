import { describe, expect, it } from 'vitest';
import {
	expandRetrievalQuery,
	fuseCandidates,
	queryCoverage,
	refineCandidates,
	selectWithNeighbors
} from './retrieval';
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

describe('fuzzy and multi-document safety', () => {
	it('adds an independent fuzzy rank without displacing exact top evidence', () => {
		const exact = { ...hit(1, 'contract', -1), text: 'Le contrat ZX-2048 expire en 2028.' };
		const fuzzy = { ...hit(2, 'contract', -2), text: 'Le contrat ZX-2047 expire en 2029.' };
		expect(refineCandidates([], [exact], 'Quand expire ZX-2048 ?', 2, [fuzzy])[0].chunkId).toBe(1);
	});

	it('lets a discriminating fuzzy candidate beat unrelated two-channel agreement', () => {
		const compromis = {
			...hit(1, 'compromis', -1),
			documentName: 'Compromis Martin.pdf',
			text: 'PRIX DE LA VENTE exact 146 000 euros'
		};
		const unrelated = { ...hit(2, 'lease', 0.8), text: 'Le locataire résilie son bail.' };
		const result = refineCandidates(
			[unrelated],
			[unrelated],
			'Quel est le prxi de vnete exct du bien Martin ?',
			2,
			[compromis]
		);
		expect(result[0].chunkId).toBe(1);
	});

	it('preserves one leading passage per document for synthesis', () => {
		const ranked = [
			{ ...hit(1, 'partie A', 1), documentId: 'a' },
			{ ...hit(2, 'partie A bis', 0.9), documentId: 'a' },
			{ ...hit(3, 'partie B', 0.8), documentId: 'b' }
		];
		const selected = selectWithNeighbors(ranked, [], 'Compare tous les documents', 2);
		expect(new Set(selected.map((item) => item.documentId))).toEqual(new Set(['a', 'b']));
	});
});

describe('retrieval refinement', () => {
	it('expands real-estate questions to document vocabulary', () => {
		expect(expandRetrievalQuery('Quel est le prix de la maison ?')).toContain(
			'vente montant euros'
		);
		expect(expandRetrievalQuery('Quel est le montant du prêt ?')).toContain('emprunt financement');
		expect(expandRetrievalQuery('Quelle est la superficie ?')).toContain(
			'contenance mètres carrés'
		);
	});

	it('expands typoed bilingual technical concepts without adding an answer', () => {
		expect(expandRetrievalQuery('Quel est le prxi de vnete exct ?')).toContain(
			'prix price vente sale montant amount euros'
		);
		expect(expandRetrievalQuery('Contnet Lenght peut il être négatif ?')).toContain(
			'Content-Length content length field non-negative'
		);
		expect(expandRetrievalQuery('Quel efet a la planifcation de deux vehicules ?')).toContain(
			'flight planning two vehicles effect'
		);
		expect(expandRetrievalQuery("Quelle datte d'entrée en viguer est indiquée ?")).toContain(
			'effective date entry into force'
		);
	});

	it('promotes the Martin price, loan and cadastral-area passages', () => {
		const candidates = [
			{ ...hit(1, 'compromis', 0.03), page: 4, text: 'Description générale de immeuble' },
			{
				...hit(2, 'compromis', 0.029),
				page: 3,
				text: 'PRIX DE LA VENTE montant CENT CINQUANTE MILLE EUROS 146.000,00 €'
			},
			{
				...hit(3, 'compromis', 0.029),
				page: 19,
				text: 'FINANCEMENT Montant du prêt 146.000,00 €'
			},
			{
				...hit(4, 'compromis', 0.029),
				page: 2,
				text: 'Une maison à usage habitation, contenance totale 76 ca'
			}
		];
		expect(
			refineCandidates(candidates, candidates, expandRetrievalQuery('prix de la maison'), 4)[0].page
		).toBe(3);
		expect(
			refineCandidates(candidates, candidates, expandRetrievalQuery('montant du prêt'), 4)[0].page
		).toBe(19);
		expect(
			refineCandidates(
				candidates,
				candidates,
				expandRetrievalQuery('superficie de la maison'),
				4
			)[0].chunkId
		).toBe(4);
	});
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

	it('preserves near-identical record pages for exhaustive questions only', () => {
		const repeated = (page: number, date: string, amount: string): SearchHit => ({
			...hit(page, 'receipts', 0.04 - page * 0.001),
			page,
			seq: page - 1,
			text: `Récépissé de transfert Expéditeur Exemple Bénéficiaire Exemple Conditions générales identiques Transaction ${date} Montant ${amount} EUR Total ${amount} EUR`
		});
		const pages = [
			repeated(1, '20 juin 2026', '120,00'),
			repeated(2, '12 juin 2026', '80,00'),
			repeated(3, '08 juin 2026', '120,00')
		];
		expect(
			selectWithNeighbors(pages, [], 'Quelle est la somme envoyée en juin ?', 8).map(
				(item) => item.page
			)
		).toEqual([1, 2, 3]);
		expect(
			selectWithNeighbors(pages, [], 'Qui est le bénéficiaire ?', 8).map((item) => item.page)
		).toHaveLength(1);
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
