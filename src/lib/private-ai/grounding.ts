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

/** Numbers that carry no claim about the document: list markers, citation
 * markers, and the small ordinals answers use to enumerate ("1.", "2)"). */
const STRUCTURAL_NUMBER = /^(?:[0-9]|1[0-9]|20)$/u;

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
 * Known limit, stated rather than papered over: this catches invented VALUES,
 * not mislabelled ones. A model that reports a document's nominal rate as its
 * TAEG states a number the evidence does contain, and only the answerability
 * gate can refuse that.
 */
export function checkNumericGrounding(answer: string, evidence: string[]): GroundingVerdict {
	const stated = numberTokens(answer.replace(/\[\d{1,2}\]/gu, ' '));
	const supported = new Set(evidence.flatMap((passage) => numberTokens(passage)));
	const unsupported = [
		...new Set(stated.filter((value) => !STRUCTURAL_NUMBER.test(value) && !supported.has(value)))
	];
	return { unsupported, grounded: unsupported.length === 0 };
}
