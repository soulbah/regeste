/**
 * The shape a grounded answer may take, enforced while the model writes.
 *
 * Spec 033. Every structural repair in this folder exists because the decoder
 * was free to emit anything: a claim with no citation, a citation pointing at an
 * excerpt that was never in the prompt, the evidence-inventory heading leaking
 * into the answer, a refusal phrased as the model's own invention rather than
 * the app's. A grammar makes those unreachable instead of detectable, and both
 * runtimes this app ships accept one on the call it already makes.
 *
 * What it does NOT do, said plainly so nobody expects it: a grammar constrains
 * SHAPE, never meaning. "Je n'ai pas compris la question [1]." satisfies every
 * rule below. Semantic failures stay the business of the evidence checks, which
 * ask whether the draft states a value the excerpts prove — a question that
 * needs no vocabulary describing how a model misbehaves.
 */

/** The switch a benchmark run flips, so the two configurations can be compared
 *  in one session without a rebuild. */
export const ANSWER_GRAMMAR_KEY = 'regeste:answer-grammar';

/**
 * Is the decoder constrained on targeted answers?
 *
 * Off until the stress benchmark has been run both ways. The grammar removes
 * whole classes of structural defect, but it also forces a citation onto every
 * sentence, and [format restrictions are measured to cost reasoning quality on
 * some tasks](https://arxiv.org/pdf/2408.02442). Flipping the default without
 * the numbers would trade a known problem for an unknown one.
 */
export function answerGrammarEnabled(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(ANSWER_GRAMMAR_KEY) === 'on';
	} catch {
		// A locked-down browser refusing storage is not a reason to fail a turn.
		return false;
	}
}

export interface AnswerGrammarOptions {
	/** How many excerpts are in the prompt. Citation indices are drawn from
	 *  exactly this range, so a citation of [9] against three excerpts cannot be
	 *  written rather than being rewritten afterwards. */
	excerptCount: number;
	/** The app's own refusal, verbatim, so an unanswerable question produces the
	 *  sentence the product wrote and not the model's paraphrase of it. */
	refusal: string;
	/** llama.cpp names its entry rule `root`; XGrammar's documentation uses
	 *  `main`. Same grammar, one word apart. */
	entry?: 'root' | 'main';
}

/** BNF string literals are double-quoted, so a quote or a backslash inside one
 *  has to be escaped. Our refusals carry apostrophes, not quotes, but the
 *  refusal is a caller-supplied string and must not be able to break the
 *  grammar it lands in. */
function literal(value: string): string {
	return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
}

/**
 * A grammar admitting either the app's refusal or a run of cited sentences.
 *
 * `body` excludes brackets and newlines so a citation marker cannot be written
 * mid-clause and scaffolding cannot open a block; everything else, including
 * the periods inside "M. Vasseur" or "1 100,50", stays legal. Sentence count is
 * bounded by `max_tokens` rather than by the grammar: `{m,n}` repetition is
 * spelled differently across the two engines and is not worth the divergence.
 */
export function buildAnswerGrammar(options: AnswerGrammarOptions): string {
	const { excerptCount, refusal, entry = 'root' } = options;
	if (!Number.isInteger(excerptCount) || excerptCount < 1)
		throw new Error(`Excerpt count must be a positive integer, got ${excerptCount}`);
	if (!refusal.trim()) throw new Error('Refusal text is required');

	const indices = Array.from({ length: excerptCount }, (_, i) => literal(String(i + 1))).join(
		' | '
	);

	return [
		`${entry} ::= refusal | answer`,
		`refusal ::= ${literal(refusal)}`,
		`answer ::= sentence (sep sentence)*`,
		`sep ::= " " | "\\n"`,
		`sentence ::= body cites "."`,
		`body ::= [^\\[\\]\\n]+`,
		`cites ::= cite (" "? cite)*`,
		`cite ::= "[" index "]"`,
		`index ::= ${indices}`
	].join('\n');
}

/**
 * Does this text satisfy the grammar above?
 *
 * The constraint engine is the enforcement; this is how the tests state what the
 * grammar means without loading a model, and how a benchmark can tell a
 * grammar-constrained run from an unconstrained one after the fact.
 */
export function matchesAnswerGrammar(text: string, options: AnswerGrammarOptions): boolean {
	const trimmed = text.trim();
	if (trimmed === options.refusal.trim()) return true;
	// The same production as the grammar, spelled as one regex: a clause with no
	// bracket, then one or more citations, then the period.
	const sentence = String.raw`[^\[\]\n]+\[\d+\](?: ?\[\d+\])*\.`;
	if (!new RegExp(`^${sentence}(?:[ \\n]${sentence})*$`, 'u').test(trimmed)) return false;
	return [...trimmed.matchAll(/\[(\d+)\]/gu)]
		.map((match) => Number(match[1]))
		.every((number) => number >= 1 && number <= options.excerptCount);
}
