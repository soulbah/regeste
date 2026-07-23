import { describe, expect, it } from 'vitest';
import {
	characterGrams,
	damerauLevenshtein,
	extractAliases,
	extractIdentifiers,
	fuzzyHeadingIndexText,
	fuzzyIndexText,
	fuzzyQueryCoverage,
	fuzzyQueryGrams,
	identifierCompatibility,
	lexicalIndexText,
	lexicalStemTokens,
	normalizeForFuzzy,
	phraseQueryCoverage,
	significantQueryTokens,
	stemmedQueryCoverage
} from './fuzzy';

describe('fuzzy retrieval views', () => {
	it('normalizes accents, ligatures, apostrophes and line-break hyphenation', () => {
		expect(normalizeForFuzzy('L’Œuvre re-\nçue à Noël')).toBe('l oeuvre recue a noel');
	});
	it('removes library stopwords while keeping discriminating French and English terms', () => {
		expect(significantQueryTokens('Qui est assuré par ce devis et avec qui ?')).toEqual([
			'assure',
			'devis'
		]);
		expect(
			significantQueryTokens('À quelle date et heure la couverture commence-t-elle ?')
		).toEqual(['date', 'heure', 'couverture', 'commence']);
		expect(significantQueryTokens('Who is covered by this insurance quote?')).toEqual([
			'covered',
			'insurance',
			'quote'
		]);
	});
	it('preserves stopword components inside meaningful hyphenated compounds', () => {
		expect(significantQueryTokens('Que se passe-t-il en cas de sous-assurance ?')).toEqual(
			expect.arrayContaining(['sous', 'assurance'])
		);
	});
	it('bridges French and English inflections without domain-specific aliases', () => {
		const underinsurance = lexicalStemTokens('sous-assurance');
		const underinsured = lexicalStemTokens('sous-assuré');
		const supplies = lexicalStemTokens('alimentations');
		const supply = lexicalStemTokens('alimentation');
		const policies = lexicalStemTokens('insurance policies');
		const policy = lexicalStemTokens('insurance policy');

		expect(underinsurance.filter((stem) => underinsured.includes(stem))).not.toHaveLength(0);
		expect(supplies.filter((stem) => supply.includes(stem))).not.toHaveLength(0);
		expect(policies.filter((stem) => policy.includes(stem))).not.toHaveLength(0);
		expect(lexicalIndexText('sous-assuré')).toContain('frstemassur');
	});
	it('scores morphology and complete phrases independently of the tested domain', () => {
		expect(stemmedQueryCoverage('alimentations couvertes', 'alimentation couverte')).toBe(1);
		expect(
			phraseQueryCoverage(
				'alimentation en gaz naturel après compteur',
				'alimentations en gaz naturel après compteur'
			)
		).toBeGreaterThan(
			phraseQueryCoverage(
				'alimentation en gaz naturel après compteur',
				'installations électriques situées après compteur alimentation électricité'
			)
		);
	});
	it('recognizes several realistic transpositions without rewarding unrelated text', () => {
		const query = 'Quel est le prxi de vnete exct du bien Morel ?';
		expect(
			fuzzyQueryCoverage(query, 'Compromis Morel prix de vente exact 152 000 euros')
		).toBeGreaterThan(0.55);
		expect(fuzzyQueryCoverage(query, 'Le locataire résilie son bail')).toBeLessThan(0.2);
	});
	it('keeps grams from a discriminating name at the end of a long question', () => {
		const grams = fuzzyQueryGrams('Quel est le prxi de vnete exct du bien Morel ?');
		expect(grams).toContain('mor');
		expect(grams).toContain('ore');
	});
	it('matches joined and split forms through a compact gram view', () => {
		expect(fuzzyIndexText('micro service')).toContain('cro');
		expect(
			characterGrams('microservice').filter((g) => characterGrams('micro service').includes(g))
				.length
		).toBeGreaterThan(8);
	});
	it('separates heading grams for structural queries', () => {
		expect(fuzzyHeadingIndexText('9.3.1 GET')).toContain('hget');
		expect(fuzzyQueryGrams('Quelle sectoin définit GET ?')).toContain('hget');
		expect(fuzzyQueryGrams('Explique GET')).not.toContain('hget');
		expect(fuzzyQueryGrams('Que prévoit la section 178.516 ?')).not.toContain('hsec');
	});
	it('handles insertion, deletion, substitution and transposition', () => {
		expect(damerauLevenshtein('retrieval', 'retrieavl')).toBe(1);
		expect(damerauLevenshtein('facture', 'facure')).toBe(1);
		expect(damerauLevenshtein('facture', 'factxre')).toBe(1);
	});
	it('extracts aliases and structured identifiers', () => {
		expect(extractAliases('Hypertext Transfer Protocol (HTTP) définit ceci.')).toEqual([
			'Hypertext Transfer Protocol',
			'HTTP'
		]);
		expect(extractIdentifiers('Voir RFC-9110 et AB/2026-0042.')).toEqual([
			'RFC-9110',
			'AB/2026-0042'
		]);
		expect(extractIdentifiers('Source rfc9110.pdf')).toEqual(['RFC9110.PDF', 'RFC9110']);
	});
	it('never lets a near identifier replace an exact conflicting identifier', () => {
		expect(identifierCompatibility('Dossier AB-2026-1042', 'Dossier AB-2026-1042 confirmé')).toBe(
			1
		);
		expect(identifierCompatibility('Dossier AB-2026-1042', 'Dossier AB-2026-1047 confirmé')).toBe(
			0
		);
	});
});
