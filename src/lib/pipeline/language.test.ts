import { describe, expect, it } from 'vitest';
import { detectLanguage } from './language';

describe('detectLanguage', () => {
	it('detects French prose', () => {
		expect(
			detectLanguage(
				'Le locataire peut résilier le bail à tout moment en adressant une lettre recommandée au bailleur. Le préavis est de trois mois et il est réduit dans les zones tendues pour les locataires qui le justifient.'
			)
		).toBe('fr');
	});

	it('detects English prose', () => {
		expect(
			detectLanguage(
				'The tenant may terminate the lease at any time by sending a registered letter to the landlord. The notice period is three months and it is reduced in areas where the tenant can justify this.'
			)
		).toBe('en');
	});

	it('returns null on gibberish or too-short text', () => {
		expect(detectLanguage('zzz kkk 123 çç')).toBeNull();
		expect(detectLanguage('foo bar baz qux quux corge grault garply waldo fred plugh')).toBeNull();
	});
});
