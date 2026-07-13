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
	normalizeForFuzzy
} from './fuzzy';

describe('fuzzy retrieval views', () => {
	it('normalizes accents, ligatures, apostrophes and line-break hyphenation', () => {
		expect(normalizeForFuzzy('L’Œuvre re-\nçue à Noël')).toBe('l oeuvre recue a noel');
	});
	it('recognizes several realistic transpositions without rewarding unrelated text', () => {
		const query = 'Quel est le prxi de vnete exct du bien Martin ?';
		expect(
			fuzzyQueryCoverage(query, 'Compromis Martin prix de vente exact 146 000 euros')
		).toBeGreaterThan(0.55);
		expect(fuzzyQueryCoverage(query, 'Le locataire résilie son bail')).toBeLessThan(0.2);
	});
	it('keeps grams from a discriminating name at the end of a long question', () => {
		const grams = fuzzyQueryGrams('Quel est le prxi de vnete exct du bien Martin ?');
		expect(grams).toContain('cap');
		expect(grams).toContain('pel');
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
