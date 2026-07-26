// Every number an answer states must be traceable to the evidence it was given.
//
// Measured on three unrelated documents: a 4B answered "18 884,73 €" for a
// section subtotal the quote states as "21 884,73 €"; it invented an entire
// borrower-insurance schedule by relabelling an interest column; a 9B reported
// "TAEG 1,9900 %" where the notice states only a nominal rate. Each is a
// confident, plausible, wrong figure carrying a clean-looking citation, which is
// the worst failure this product can produce.
//
// The check knows nothing about money, rates or French banking. It compares the
// digits an answer states against the digits it was shown, which is why it works
// the same on a quote, a loan offer and a payment schedule.

import { numberTokens } from './prompt';
import { numericValues } from '$lib/numbers';

/** Numbers that carry no claim about the document: list markers, citation
 * markers, and the small ordinals answers use to enumerate ("1.", "2)"). */
const STRUCTURAL_NUMBER = /^(?:[0-9]|1[0-9]|20)$/u;

/**
 * The marks that tell an arithmetic result apart from a claim about the page.
 *
 * "Le plafond est de 300 €" asserts a figure the document must print. "La
 * différence est de 2 700 € (3 000 € − 300 €)" asserts a relation between two
 * figures it prints, and the result is correctly absent from the page. Only
 * operators and the words for a gap qualify: "total", "somme" and their kind
 * are field names a document carries, so a fabricated total would license
 * itself.
 */
const DERIVATION_MARK = /[×÷*=]|\b(?:diff[ée]rence|[ée]cart|gap)\b/iu;

/** Arithmetic an answer may do in one step over two figures it was shown. */
const OPERATIONS: ReadonlyArray<(left: number, right: number) => number> = [
	(left, right) => left + right,
	(left, right) => left - right,
	(left, right) => left * right,
	(left, right) => (right === 0 ? Number.NaN : left / right)
];

/** Money rounds to the cent, so a derived value has to land within half of one. */
const TOLERANCE = 0.005;

function derivable(value: number, pool: readonly number[]): boolean {
	for (const left of pool)
		for (const right of pool)
			for (const operation of OPERATIONS) {
				const result = operation(left, right);
				if (Number.isFinite(result) && Math.abs(result - value) <= TOLERANCE) return true;
			}
	return false;
}

/**
 * The answer, or a refusal when it states a number its evidence does not carry.
 *
 * Refusing the whole answer rather than trimming the offending sentence is the
 * decided policy: on a document product a wrong figure costs more than a missing
 * one, and a half-deleted answer reads as though the rest were verified when it
 * was only unnumbered.
 */
export function groundedOrRefused(
	text: string,
	evidence: string[],
	refusal: string
): { text: string; unsupported: string[] } {
	const verdict = checkNumericGrounding(text, evidence);
	return verdict.grounded
		? { text, unsupported: [] }
		: { text: refusal, unsupported: verdict.unsupported };
}

export interface GroundingVerdict {
	/** Numbers stated by the answer that appear nowhere in the evidence. */
	unsupported: string[];
	grounded: boolean;
}

/**
 * Which of an answer's numbers the evidence does not support.
 *
 * Citation markers are stripped first: "[1]" is the app's own annotation, not a
 * claim. Small bare integers are ignored because an answer legitimately numbers
 * its own list items, and a fabricated quantity is essentially never a bare
 * digit.
 *
 * An answer that computes is held to the same standard by a different route.
 * Asked whether twelve instalments of 14,91 € make the stated annual premium,
 * a correct answer states 178,92 € and a 6,58 € gap, and the document prints
 * neither. So when the answer shows it is doing arithmetic, a stated value may
 * instead be one step of it over figures the evidence does carry. Results are
 * admitted left to right, which is what lets the gap lean on the product the
 * same sentence just established.
 *
 * Known limit, stated rather than papered over: this catches invented VALUES,
 * not mislabelled ones. A model that reports a document's nominal rate as its
 * TAEG states a number the evidence does contain, and only the answerability
 * gate can refuse that.
 */
export function checkNumericGrounding(answer: string, evidence: string[]): GroundingVerdict {
	const text = answer.replace(/\[\d{1,2}\]/gu, ' ');
	const stated = numberTokens(text);
	const supported = new Set(evidence.flatMap((passage) => numberTokens(passage)));
	const computing = DERIVATION_MARK.test(text);
	const pool = computing ? evidence.flatMap((passage) => numericValues(passage)) : [];

	const unsupported: string[] = [];
	for (const value of stated) {
		if (STRUCTURAL_NUMBER.test(value) || supported.has(value)) continue;
		if (computing && derivable(Number(value), pool)) {
			supported.add(value);
			pool.push(Number(value));
			continue;
		}
		if (!unsupported.includes(value)) unsupported.push(value);
	}
	return { unsupported, grounded: unsupported.length === 0 };
}
