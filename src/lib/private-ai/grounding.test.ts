import { describe, expect, it } from 'vitest';
import { checkNumericGrounding } from './grounding';

describe('checkNumericGrounding', () => {
	it('catches a fabricated amount', () => {
		// Measured on the construction quote: the section subtotal is 21 884,73 €
		// and a 4B answered 18 884,73 € — plausible, cited, and wrong by 3 000 €.
		const evidence = ['1 Toiture principale + Garage 21 884,73 €', 'Total net HT 38 940,84 €'];
		expect(checkNumericGrounding('La toiture principale coûte 18 884,73 € [1].', evidence)).toEqual(
			{
				unsupported: ['1888473'],
				grounded: false
			}
		);
		expect(
			checkNumericGrounding('La toiture principale coûte 21 884,73 € [1].', evidence).grounded
		).toBe(true);
	});

	it('catches an invented series', () => {
		// Measured on the amortization notice: asked for borrower insurance, which
		// the document does not carry, a 4B relabelled the interest column and
		// produced a schedule of monthly premiums.
		const evidence = ['1 05.11.2025 14 949,07 69,39 50,93 18,46'];
		const invented = "L'assurance emprunteur est de 21,11 € en 2029, 20,29 € en 2030.";
		expect(checkNumericGrounding(invented, evidence).grounded).toBe(false);
	});

	it('accepts the document’s own formatting of a value', () => {
		// The answer may write an amount its own way as long as it is the same
		// number: thousands separators and currency marks are not claims.
		const evidence = ['Montant du prêt : 165 000,00 €. Durée : 300 mois.'];
		expect(checkNumericGrounding('Le prêt est de 165 000,00 euros [1].', evidence).grounded).toBe(
			true
		);
		expect(checkNumericGrounding('Le prêt court sur 300 mois [1].', evidence).grounded).toBe(true);
	});

	it('does not trip on an answer numbering its own list', () => {
		const evidence = ['La franchise est de 300 € par sinistre.'];
		expect(
			checkNumericGrounding('1. La franchise est de 300 € [1].\n2. Rien d’autre.', evidence)
				.grounded
		).toBe(true);
	});

	it('cannot see a number that is real but mislabelled', () => {
		// The honest limit. A 9B reported "TAEG 1,9900 %" from a notice stating
		// only a nominal rate: the digits are in the evidence, so this check
		// passes it and the answerability gate is what has to refuse.
		const evidence = ['Taux : 1,9900 TAUX', 'Durée en mois : 240'];
		expect(checkNumericGrounding('Le TAEG est de 1,9900 % [1].', evidence).grounded).toBe(true);
	});
});
