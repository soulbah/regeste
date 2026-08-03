import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ANSWER_GRAMMAR_KEY,
	answerGrammarEnabled,
	buildAnswerGrammar,
	matchesAnswerGrammar
} from './answer-grammar';

const REFUSAL = "Je n'ai pas trouvé assez d'informations dans les documents joints pour répondre.";
const options = { excerptCount: 3, refusal: REFUSAL };

afterEach(() => vi.unstubAllGlobals());

describe('the answer grammar switch', () => {
	it('stays off by default and keeps an explicit benchmark opt-in', () => {
		const values = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => values.get(key) ?? null
		});
		expect(answerGrammarEnabled()).toBe(false);
		values.set(ANSWER_GRAMMAR_KEY, 'on');
		expect(answerGrammarEnabled()).toBe(true);
	});
});

describe('the answer grammar', () => {
	it('draws citation indices from the excerpts actually in the prompt', () => {
		const grammar = buildAnswerGrammar({ ...options, excerptCount: 2 });
		expect(grammar).toContain('index ::= "1" | "2"');
		expect(grammar).not.toContain('"3"');
	});

	it('names its entry rule for the runtime that reads it', () => {
		expect(buildAnswerGrammar(options)).toMatch(/^root ::=/u);
		expect(buildAnswerGrammar({ ...options, entry: 'main' })).toMatch(/^main ::=/u);
	});

	it('refuses to build a grammar that cannot be satisfied', () => {
		expect(() => buildAnswerGrammar({ ...options, excerptCount: 0 })).toThrow();
		expect(() => buildAnswerGrammar({ ...options, refusal: '  ' })).toThrow();
	});

	it('escapes a refusal that would otherwise break out of its literal', () => {
		const grammar = buildAnswerGrammar({ ...options, refusal: 'He said "no".' });
		expect(grammar).toContain('refusal ::= "He said \\"no\\"."');
	});
});

describe('what the grammar admits', () => {
	it.each([
		'Votre directeur d’agence est AMELIE ROUSSEAU [1].',
		'Le montant forfaitaire est de 1100 € HT [1].',
		'Le délai est de quatorze jours [1]. Il court dès la signature [2].',
		'Deux passages le confirment [1][2].',
		'Deux passages le confirment [1] [2].',
		// A period inside the clause is ordinary prose, not a sentence boundary.
		'Le signataire est M. Vasseur [3].',
		REFUSAL
	])('admits %s', (answer) => {
		expect(matchesAnswerGrammar(answer, options)).toBe(true);
	});

	it.each([
		// The defect the citation repair existed for.
		["Votre directeur d'agence est AMELIE ROUSSEAU.", 'a claim with no citation'],
		['Le montant est de 1100 € HT [7].', 'a citation of an excerpt that was never sent'],
		['Structured evidence inventory\n- [1] page 3', 'scaffolding leaking into the answer'],
		["Je n'ai pas trouvé cette information.", 'a refusal the model phrased itself'],
		['Le montant est de 1100 € HT [1]', 'an answer that never terminates']
	])('refuses %s (%s)', (answer) => {
		expect(matchesAnswerGrammar(answer, options)).toBe(false);
	});

	it('constrains shape and not meaning, which is the honest limit', () => {
		// Worth pinning: nobody should read the grammar as a semantic guard. A
		// useless answer in the right shape passes, and the evidence checks are
		// what catch it.
		expect(matchesAnswerGrammar("Je n'ai pas compris la question [1].", options)).toBe(true);
	});
});
