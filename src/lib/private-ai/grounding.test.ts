import { describe, expect, it } from 'vitest';
import { canonicalNumbers, numericValues } from '$lib/numbers';
import { checkNumericGrounding } from './grounding';

describe('checkNumericGrounding', () => {
	it('catches a fabricated amount', () => {
		// Measured on the construction quote: the section subtotal is 21 884,73 €
		// and a 4B answered 18 884,73 € — plausible, cited, and wrong by 3 000 €.
		const evidence = ['1 Toiture principale + Garage 21 884,73 €', 'Total net HT 38 940,84 €'];
		expect(checkNumericGrounding('La toiture principale coûte 18 884,73 € [1].', evidence)).toEqual(
			{
				unsupported: ['18884.73'],
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

	it('reads one figure per cell in a table flattened to text', () => {
		// Measured regression, and the reason this file exists: a PDF table puts one
		// figure per line, and the old grammar let `\s` swallow the line break, so
		// "180,00\n0,00" became the single token 1800000. The answer then found no
		// support for a figure printed right there in its evidence and a correct
		// answer was refused.
		const evidence = ['Commission :\n:\nFrais de dossier\n:\nFIXE\n180,00\n0,00'];
		expect(
			checkNumericGrounding('Les frais de dossier sont de 180,00 euros [1].', evidence).grounded
		).toBe(true);
		// The merge must not become permissive either: 18 000 is not in that cell.
		expect(
			checkNumericGrounding('Les frais de dossier sont de 18 000 euros [1].', evidence).unsupported
		).toEqual(['18000']);
	});

	it('accepts arithmetic the answer shows over figures it was shown', () => {
		// Both measured on the insurance set, and both correct answers the strict
		// check refused: the document prints neither the product nor the gap.
		const premium = [
			'Cotisation mensuelle 14,91 € TTC',
			'Cotisation annuelle 185,50 € TTC pour 12 mois'
		];
		expect(
			checkNumericGrounding(
				'12 × 14,91 € = 178,92 €. La prime annuelle indiquée est 185,50 €. Ils ne correspondent pas : l’écart est de 6,58 € [1].',
				premium
			).grounded
		).toBe(true);

		const ceilings = ['Plomberie intérieure : 300 € TTC', 'Plomberie extérieure : 3 000 € TTC'];
		expect(
			checkNumericGrounding('La différence est de 2 700 € (3 000 € - 300 €).', ceilings).grounded
		).toBe(true);
	});

	it('accepts a derived percentage change over grouped table integers', () => {
		const evidence = ['Total assets 6,420,536 6,887,265'];
		expect(canonicalNumbers(evidence[0])).toEqual(['6420536', '6887265']);
		expect(numericValues(evidence[0])).toEqual([6420536, 6887265]);
		const answer =
			'Le total passe de 6,887,265 à 6,420,536 : l’écart est de −466 729, soit −6,78 %.';
		expect(checkNumericGrounding(answer, evidence)).toEqual({ unsupported: [], grounded: true });
	});

	it('refuses arithmetic that does not come out', () => {
		const premium = ['Cotisation mensuelle 14,91 € TTC', 'Cotisation annuelle 185,50 € TTC'];
		expect(checkNumericGrounding('12 × 14,91 € = 190,00 € [1].', premium).unsupported).toEqual([
			'190'
		]);
	});

	it('does not let a plain claim borrow the arithmetic licence', () => {
		// The relaxation is keyed to an answer that shows it is computing. A
		// fabricated figure asserted flat stays refused even though the evidence
		// carries numbers it could have been built from.
		const evidence = ['1 Toiture principale + Garage 21 884,73 €', 'Total net HT 38 940,84 €'];
		expect(
			checkNumericGrounding('La toiture principale coûte 18 884,73 € [1].', evidence).grounded
		).toBe(false);
	});

	it('cannot see a number that is real but mislabelled', () => {
		// The honest limit. A 9B reported "TAEG 1,9900 %" from a notice stating
		// only a nominal rate: the digits are in the evidence, so this check
		// passes it and the answerability gate is what has to refuse.
		const evidence = ['Taux : 1,9900 TAUX', 'Durée en mois : 240'];
		expect(checkNumericGrounding('Le TAEG est de 1,9900 % [1].', evidence).grounded).toBe(true);
	});
});

describe('checkNumericGrounding — a total the answer writes out', () => {
	// Measured on a real fee agreement: RAPO 1100, TA 900, référé 800, all three
	// printed on pages 12-13. The answer added them correctly and was refused
	// whole, because no PAIR of those figures makes 2800.
	const fees = [
		'• 1100 euros, à titre de provision pour la formulation du RAPO (point 2.1.1) ;',
		'• 900 euros, à titre de provision pour la saisine du tribunal administratif (point 2.1.2.) ;',
		'• 800 € HT, pour la préparation d’une procédure de référé suspension (1 visa concerné)'
	];

	it('admits a three-term sum whose operands the evidence carries', () => {
		const answer = '1100 € HT (RAPO) + 900 € HT (TA) + 800 € HT (référé) = 2800 € HT';
		expect(checkNumericGrounding(answer, fees)).toEqual({ unsupported: [], grounded: true });
	});

	it('refuses a total the same operands do not produce', () => {
		// The pair search had no opinion on this; reading the expression does.
		const answer = '1100 € HT + 900 € HT + 800 € HT = 3000 € HT';
		expect(checkNumericGrounding(answer, fees).unsupported).toContain('3000');
	});

	it('refuses a sum resting on an operand the evidence never printed', () => {
		const answer = '1100 € HT + 900 € HT + 1500 € HT = 3500 € HT';
		const verdict = checkNumericGrounding(answer, fees);
		expect(verdict.grounded).toBe(false);
		expect(verdict.unsupported).toContain('1500');
	});

	it('still admits the two-step derivation the pair search was built for', () => {
		// The pair search reaches this one because both operands are printed: the
		// product leans on 12 and 14,91, then the gap leans on the product.
		const answer = '12 × 14,91 € = 178,92 €, soit un écart de 6,58 € avec 185,50 €';
		const evidence = ['12 mensualités de 14,91 €', 'prime annuelle 185,50 €'];
		expect(checkNumericGrounding(answer, evidence)).toEqual({ unsupported: [], grounded: true });
	});
});
