import { damerauLevenshtein, normalizeForFuzzy, stemmedQueryCoverage } from '$lib/pipeline/fuzzy';
import { hasAnswerBearingEvidence } from '$lib/pipeline/relevance';
import {
	buildUserPrompt,
	fitEvidenceToContext,
	groundedRefusal,
	resolveCitations,
	resolveTargetedCitations,
	isRefusalLike,
	stripThink,
	SYSTEM_PROMPT
} from '$lib/private-ai/prompt';
import type { SearchHit } from '$lib/types';

export interface PrivateDocumentStressCase {
	id: string;
	question: string;
	answerable: boolean;
	/**
	 * `answer`: the requested fact is present.
	 * `qualified`: the exact premise is false/underspecified, but the document
	 * contains a directly useful fact that must be stated and cited.
	 * `refusal`: the document contains no answer; no citation may pretend to
	 * prove an absence.
	 */
	expectedOutcome?: 'answer' | 'qualified' | 'refusal';
	pageGroups: number[][];
	/** Direct source phrases used only for retrieval triage. Keep derived
	 * calculations, yes/no conclusions and qualified wording in answerGroups. */
	evidenceGroups?: string[][];
	answerGroups: string[][];
	forbiddenAnswerGroups?: string[][];
}

export interface PrivateDocumentStressMatrix {
	documentName: string;
	cases: PrivateDocumentStressCase[];
}

export interface PrivateDocumentStressResult {
	id: string;
	question: string;
	expectedOutcome: 'answer' | 'qualified' | 'refusal';
	route: 'targeted' | 'synthesis';
	passed: boolean;
	retrievalPassed: boolean;
	pageRecallPassed: boolean;
	answerGroupTriagePassed: boolean;
	answerPassed: boolean;
	citationPassed: boolean;
	answerBearing: boolean;
	alternateQueries: string[];
	retrievedPages: Array<number | null>;
	retrievedEvidence: Array<{ page: number | null; text: string }>;
	rawRetrievedPages: Array<number | null>;
	rawRetrievedEvidence: Array<{ page: number | null; text: string }>;
	citedPages: Array<number | null>;
	missingPageGroups: number[][];
	missingAnswerGroups: string[][];
	unexpectedAnswerGroups: string[][];
	answer: string;
	answerSource: StressAnswerSource;
	generationSkipped: boolean;
	retrievalMs: number;
	generationMs: number;
}

export type PrivateDocumentStressOutcome = 'answer' | 'qualified' | 'refusal';

/**
 * Which code path produced the answer. Without this the headline score is
 * unattributable: a deterministic extraction, a replayed cache entry and a live
 * model generation are three different claims about the product.
 */
export type StressAnswerSource = 'extractive' | 'cached' | 'llm' | 'skipped' | 'no-evidence';

export type StressGeneration = string | { text: string; source: StressAnswerSource };

function generationText(value: StressGeneration): string {
	return typeof value === 'string' ? value : value.text;
}

function generationSource(value: StressGeneration): StressAnswerSource {
	return typeof value === 'string' ? 'llm' : value.source;
}

function expectedOutcomeFor(test: PrivateDocumentStressCase): PrivateDocumentStressOutcome {
	return test.expectedOutcome ?? (test.answerable ? 'answer' : 'refusal');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringMatrix(value: unknown): value is string[][] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every(
			(group) =>
				Array.isArray(group) &&
				group.length > 0 &&
				group.every((alternative) => typeof alternative === 'string' && alternative.length > 0)
		)
	);
}

function isNumberMatrix(value: unknown): value is number[][] {
	return (
		Array.isArray(value) &&
		value.every(
			(group) =>
				Array.isArray(group) &&
				group.length > 0 &&
				group.every((page) => Number.isInteger(page) && page > 0)
		)
	);
}

export function parsePrivateDocumentStressMatrix(value: unknown): PrivateDocumentStressMatrix {
	if (!isRecord(value) || typeof value.documentName !== 'string' || !Array.isArray(value.cases)) {
		throw new Error('Invalid private-document benchmark matrix');
	}
	const cases = value.cases.map((candidate, index): PrivateDocumentStressCase => {
		if (
			!isRecord(candidate) ||
			typeof candidate.id !== 'string' ||
			typeof candidate.question !== 'string' ||
			typeof candidate.answerable !== 'boolean' ||
			!isNumberMatrix(candidate.pageGroups) ||
			!isStringMatrix(candidate.answerGroups)
		) {
			throw new Error(`Invalid private-document benchmark case at index ${index}`);
		}
		const expectedOutcome =
			candidate.expectedOutcome === undefined
				? candidate.answerable
					? 'answer'
					: 'refusal'
				: candidate.expectedOutcome === 'answer' ||
					  candidate.expectedOutcome === 'qualified' ||
					  candidate.expectedOutcome === 'refusal'
					? candidate.expectedOutcome
					: (() => {
							throw new Error(`Invalid private-document benchmark case at index ${index}`);
						})();
		if ((expectedOutcome === 'refusal') !== !candidate.answerable) {
			throw new Error(`Inconsistent private-document benchmark outcome at index ${index}`);
		}
		if (
			expectedOutcome === 'refusal'
				? candidate.pageGroups.length > 0
				: candidate.pageGroups.length === 0
		) {
			throw new Error(`Invalid private-document benchmark page groups at index ${index}`);
		}
		return {
			id: candidate.id,
			question: candidate.question,
			answerable: candidate.answerable,
			expectedOutcome,
			pageGroups: candidate.pageGroups,
			...(candidate.evidenceGroups === undefined
				? {}
				: isStringMatrix(candidate.evidenceGroups)
					? { evidenceGroups: candidate.evidenceGroups }
					: (() => {
							throw new Error(`Invalid private-document benchmark case at index ${index}`);
						})()),
			answerGroups: candidate.answerGroups,
			...(candidate.forbiddenAnswerGroups === undefined
				? {}
				: isStringMatrix(candidate.forbiddenAnswerGroups)
					? { forbiddenAnswerGroups: candidate.forbiddenAnswerGroups }
					: (() => {
							throw new Error(`Invalid private-document benchmark case at index ${index}`);
						})())
		};
	});
	if (new Set(cases.map((test) => test.id)).size !== cases.length) {
		throw new Error('Private-document benchmark case ids must be unique');
	}
	return { documentName: value.documentName, cases };
}

/** Runtime-only source boundary: an oracle cannot cite pages outside the
 * document it claims to describe. */
export function assertPrivateDocumentStressPages(
	matrix: PrivateDocumentStressMatrix,
	pageCount: number | null
): void {
	if (pageCount === null || !Number.isInteger(pageCount) || pageCount < 1) {
		throw new Error('Private-document benchmark requires a known positive page count');
	}
	for (const test of matrix.cases) {
		for (const group of test.pageGroups) {
			for (const page of group) {
				if (page > pageCount)
					throw new Error(`Oracle page ${page} exceeds ${pageCount} (${test.id})`);
			}
		}
	}
}

function refusalMatchesQuestionLanguage(question: string, answer: string): boolean {
	if (!isRefusalLike(answer)) return false;
	const frenchQuestion =
		/[àâçéèêëîïôùûüÿœ]|\b(?:quel|quelle|quels|quelles|combien|document)\b/iu.test(question);
	if (frenchQuestion && /\bi couldn'?t find enough information\b/iu.test(answer)) return false;
	if (!frenchQuestion && /\bje n['’]?ai pas trouv/iu.test(answer)) return false;
	return true;
}

interface RetrievedStressCase {
	test: PrivateDocumentStressCase;
	route: 'targeted' | 'synthesis';
	hits: SearchHit[];
	rawHits: SearchHit[];
	answerBearing: boolean;
	alternateQueries: string[];
	retrievedPages: Array<number | null>;
	rawRetrievedPages: Array<number | null>;
	missingPageGroups: number[][];
	pageRecallPassed: boolean;
	answerGroupTriagePassed: boolean;
	retrievalPassed: boolean;
	retrievalMs: number;
}

async function mapWithConcurrency<T, R>(
	values: readonly T[],
	concurrency: number,
	map: (value: T, index: number) => Promise<R>,
	onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
	const results = new Array<R>(values.length);
	let next = 0;
	let completed = 0;
	const worker = async () => {
		while (next < values.length) {
			const index = next++;
			results[index] = await map(values[index], index);
			completed++;
			onProgress?.(completed, values.length);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, () => worker())
	);
	return results;
}

async function retrieveStressCases(input: {
	documentId: string;
	cases: readonly PrivateDocumentStressCase[];
	retrieve: (
		question: string,
		documentIds: string[],
		route: 'targeted' | 'synthesis'
	) => Promise<{ hits: SearchHit[]; alternateQueries: string[] }>;
	resolveRoute: (question: string) => Promise<'targeted' | 'synthesis'>;
	concurrency?: number;
	onProgress?: (completed: number, total: number) => void;
}): Promise<RetrievedStressCase[]> {
	return mapWithConcurrency(
		input.cases,
		input.concurrency ?? 4,
		async (test) => {
			const startedAt = performance.now();
			const expectedOutcome = expectedOutcomeFor(test);
			const route = await input.resolveRoute(test.question);
			const retrieved = await input.retrieve(test.question, [input.documentId], route);
			const rawHits = retrieved.hits;
			const answerBearing = hasAnswerBearingEvidence(
				test.question,
				rawHits,
				retrieved.alternateQueries
			);
			const hits = answerBearing ? rawHits : [];
			const retrievedPages = hits.map((hit) => hit.page);
			const rawRetrievedPages = rawHits.map((hit) => hit.page);
			const missingPageGroups = test.pageGroups.filter(
				(group) => !group.some((page) => rawRetrievedPages.includes(page))
			);
			const rawRetrievedTexts = rawHits.map((hit) => hit.text);
			const pageRecallPassed = expectedOutcome === 'refusal' || missingPageGroups.length === 0;
			const answerGroupTriagePassed =
				expectedOutcome === 'refusal'
					? !answerBearing
					: evidenceCoversAnswerGroups(rawRetrievedTexts, test.evidenceGroups ?? test.answerGroups);
			const retrievalPassed =
				expectedOutcome === 'refusal'
					? !answerBearing
					: answerBearing && pageRecallPassed && answerGroupTriagePassed;
			return {
				test,
				route,
				hits,
				rawHits,
				answerBearing,
				alternateQueries: retrieved.alternateQueries,
				retrievedPages,
				rawRetrievedPages,
				missingPageGroups,
				pageRecallPassed,
				answerGroupTriagePassed,
				retrievalPassed,
				retrievalMs: performance.now() - startedAt
			};
		},
		input.onProgress
	);
}

export async function runPrivateDocumentRetrievalStress(input: {
	documentId: string;
	cases: readonly PrivateDocumentStressCase[];
	retrieve: (
		question: string,
		documentIds: string[],
		route: 'targeted' | 'synthesis'
	) => Promise<{ hits: SearchHit[]; alternateQueries: string[] }>;
	resolveRoute: (question: string) => Promise<'targeted' | 'synthesis'>;
	concurrency?: number;
	onProgress?: (completed: number, total: number) => void;
}) {
	const results = await retrieveStressCases(input);
	return {
		total: results.length,
		passed: results.filter((result) => result.retrievalPassed).length,
		pageRecallPassed: results.filter((result) => result.pageRecallPassed).length,
		answerGroupTriagePassed: results.filter((result) => result.answerGroupTriagePassed).length,
		score: results.filter((result) => result.retrievalPassed).length / Math.max(results.length, 1),
		elapsedRetrievalMs: results.reduce((sum, result) => sum + result.retrievalMs, 0),
		failures: results.filter((result) => !result.retrievalPassed),
		results
	};
}

/** Benchmark-only tolerant comparison: formatting and one-character
 * inflections must not turn a correct grounded answer into a failure. This is
 * deliberately lexical, not semantic: missing facts still need an explicit
 * oracle alternative. */
const MEASURE_NUMBER_WORDS: Readonly<Record<string, string>> = {
	zero: '0',
	un: '1',
	une: '1',
	one: '1',
	deux: '2',
	two: '2',
	trois: '3',
	three: '3',
	quatre: '4',
	four: '4',
	cinq: '5',
	five: '5',
	six: '6',
	sept: '7',
	seven: '7',
	huit: '8',
	eight: '8',
	neuf: '9',
	nine: '9',
	dix: '10',
	ten: '10',
	onze: '11',
	eleven: '11',
	douze: '12',
	twelve: '12'
};

/** The oracle deliberately writes truncated stems ("declar", "renon", "couvre")
 * so one alternative covers a family of inflections. Prefix tolerance keeps
 * that, but only for alphabetic stems long enough to be unambiguous: plain
 * substring matching also found "non" inside "renonciation" and "pas" inside
 * "passage", which let a polar alternative match text saying the opposite. */
function tokenMatches(candidate: string, expected: string): boolean {
	if (candidate === expected) return true;
	// French glues a value to its unit: "70m²", "300€", "18m2". Normalization
	// leaves those as one token, so a bare numeric alternative has to reach past
	// the unit. Requiring a letter immediately after the digits keeps "70" out of
	// "706" and "7000" while letting it match "70m2".
	if (/^\d+$/u.test(expected)) {
		return candidate.startsWith(expected) && /^\p{L}/u.test(candidate.slice(expected.length));
	}
	return expected.length >= 5 && !/\d/u.test(expected) && candidate.startsWith(expected);
}

/** Whole-token containment: every expected token must match a consecutive
 * candidate token, in order. `normalizeForFuzzy` emits space-separated tokens,
 * so this is a windowed scan rather than a substring test. */
export function containsTokenSequence(normalizedText: string, normalizedNeedle: string): boolean {
	const expected = normalizedNeedle.split(' ').filter(Boolean);
	if (!expected.length) return false;
	const candidates = normalizedText.split(' ').filter(Boolean);
	for (let start = 0; start + expected.length <= candidates.length; start++) {
		if (expected.every((token, offset) => tokenMatches(candidates[start + offset], token)))
			return true;
	}
	return false;
}

export function matchesAnswerAlternative(answer: string, alternative: string): boolean {
	const normalizedAnswer = normalizeForFuzzy(answer);
	const normalizedAlternative = normalizeForFuzzy(alternative);
	const measureSignatures = (value: string) => {
		const canonical = normalizeForFuzzy(value)
			.replace(
				/\b(?:zero|un|une|one|deux|two|trois|three|quatre|four|cinq|five|six|sept|seven|huit|eight|neuf|nine|dix|ten|onze|eleven|douze|twelve)\b/g,
				(word) => MEASURE_NUMBER_WORDS[word]
			)
			.replace(/\bannees?\b/g, 'an')
			.replace(/\bans\b/g, 'an')
			.replace(/\byears?\b/g, 'an')
			.replace(/\bjours\b/g, 'jour')
			.replace(/\bdays?\b/g, 'jour')
			.replace(/\bheures\b/g, 'heure')
			.replace(/\bhours?\b/g, 'heure')
			.replace(/\bsemaines\b/g, 'semaine')
			.replace(/\bweeks?\b/g, 'semaine')
			.replace(/\bminutes\b/g, 'minute');
		return [
			...canonical.matchAll(
				/\b(\d+(?:[.,]\d+)?)\s*(?:\(\s*\d+(?:[.,]\d+)?\s*\)\s*)?(an|mois|jour|heure|semaine|minute)\b/g
			)
		].map((match) => `${match[1].replace(',', '.')}:${match[2]}`);
	};
	const expectedMeasures = measureSignatures(alternative);
	if (expectedMeasures.length > 0) {
		const availableMeasures = new Set(measureSignatures(answer));
		if (!expectedMeasures.every((measure) => availableMeasures.has(measure))) return false;
	}
	const numericValues = (value: string) => {
		const withoutListMarkers = value.replace(/(^|\n)\s*\d{1,3}[.)]\s+/g, '$1');
		return (withoutListMarkers.match(/(?<!\d)\d(?:[\d \u00a0.,/:-]*\d)?(?!\d)/g) ?? []).map(
			(match) => match.replace(/\D/g, '')
		);
	};
	const expectedNumbers = numericValues(alternative).filter((value) => value.length >= 3);
	const availableNumbers = numericValues(answer);
	const numbersMatch = expectedNumbers.every(
		(expected) =>
			availableNumbers.includes(expected) ||
			(expected.length >= 6 && availableNumbers.some((available) => available.endsWith(expected)))
	);
	if (expectedNumbers.length > 0 && !numbersMatch) return false;
	if (containsTokenSequence(normalizedAnswer, normalizedAlternative)) return true;
	if (
		expectedNumbers.length > 0 &&
		normalizedAlternative.split(' ').every((token) => /^\d+$/.test(token))
	)
		return true;
	if (stemmedQueryCoverage(alternative, answer) === 1) return true;

	const available = normalizedAnswer.split(' ').filter(Boolean);
	const expected = normalizedAlternative.split(' ').filter(Boolean);
	if (!expected.length) return false;
	let cursor = -1;
	for (const token of expected) {
		const next = available.findIndex((candidate, index) => {
			if (index <= cursor || (cursor >= 0 && index > cursor + 4)) return false;
			if (candidate === token) return true;
			if (candidate.length >= 7 && token.length >= 7 && candidate.slice(0, 6) === token.slice(0, 6))
				return true;
			const minimumLength = Math.min(candidate.length, token.length);
			return minimumLength >= 5 && damerauLevenshtein(candidate, token, 1) <= 1;
		});
		if (next < 0) return false;
		cursor = next;
	}
	return true;
}

/** Forbidden phrases encode a precise failure mode. Approximate/stemmed
 * matching is unsafe here because it can erase polarity words ("pas", "si")
 * and turn a correct negation into a false positive. */
export function matchesForbiddenAnswerAlternative(answer: string, alternative: string): boolean {
	return containsTokenSequence(normalizeForFuzzy(answer), normalizeForFuzzy(alternative));
}

/** Benchmark-only lexical triage, also used to decide whether a cached local
 * generation remains usable after oracle corrections. Semantic human review
 * stays authoritative. */
export function answerMatchesStressOracle(
	test: PrivateDocumentStressCase,
	answer: string
): boolean {
	const expectedOutcome = expectedOutcomeFor(test);
	if (expectedOutcome === 'refusal') return refusalMatchesQuestionLanguage(test.question, answer);
	return (
		test.answerGroups.every((group) =>
			group.some((alternative) => matchesAnswerAlternative(answer, alternative))
		) &&
		!(test.forbiddenAnswerGroups ?? []).some((group) =>
			group.some((alternative) => matchesForbiddenAnswerAlternative(answer, alternative))
		)
	);
}

export function evidenceCoversAnswerGroups(texts: string[], groups: string[][]): boolean {
	return groups.every((group) =>
		group.some((alternative) => texts.some((text) => matchesAnswerAlternative(text, alternative)))
	);
}

export async function runPrivateDocumentStress(input: {
	documentId: string;
	cases: readonly PrivateDocumentStressCase[];
	retrieve: (
		question: string,
		documentIds: string[],
		route: 'targeted' | 'synthesis'
	) => Promise<{ hits: SearchHit[]; alternateQueries: string[] }>;
	generate: (
		messages: Array<{ role: 'system' | 'user'; content: string }>,
		question: string,
		route: 'targeted' | 'synthesis',
		hits: SearchHit[]
	) => Promise<StressGeneration>;
	resolveRoute: (question: string) => Promise<'targeted' | 'synthesis'>;
	retrievalConcurrency?: number;
	skipGenerationOnRetrievalFailure?: boolean;
	onProgress?: (completed: number, total: number) => void;
	onGenerationProgress?: (completed: number, total: number) => void;
	onResult?: (result: PrivateDocumentStressResult, completed: number, total: number) => void;
}): Promise<{
	total: number;
	passed: number;
	retrievalPassed: number;
	pageRecallPassed: number;
	answerGroupTriagePassed: number;
	answerPassed: number;
	citationPassed: number;
	score: number;
	/** Headline score decomposed by the path that produced each answer. */
	bySource: Record<StressAnswerSource, { total: number; passed: number }>;
	failures: PrivateDocumentStressResult[];
	results: PrivateDocumentStressResult[];
}> {
	const retrievedCases = await retrieveStressCases({
		documentId: input.documentId,
		cases: input.cases,
		retrieve: input.retrieve,
		resolveRoute: input.resolveRoute,
		concurrency: input.retrievalConcurrency,
		onProgress: input.onProgress
	});
	const results: PrivateDocumentStressResult[] = [];
	for (const retrievedCase of retrievedCases) {
		const {
			test,
			route,
			hits: retrievedHits,
			answerBearing,
			rawHits,
			alternateQueries,
			retrievedPages,
			missingPageGroups,
			pageRecallPassed,
			answerGroupTriagePassed,
			retrievalMs
		} = retrievedCase;
		// Same clamp as the app path: prompt, generation and citation resolution
		// must all see one list, trimmed to the model's context window.
		const hits = fitEvidenceToContext(test.question, retrievedHits);
		const expectedOutcome = expectedOutcomeFor(test);
		const retrievalPassed = retrievedCase.retrievalPassed;
		const generationSkipped =
			(input.skipGenerationOnRetrievalFailure ?? true) &&
			expectedOutcome !== 'refusal' &&
			!answerBearing;
		const generationStartedAt = performance.now();
		const generated: StressGeneration = hits.length
			? generationSkipped
				? { text: groundedRefusal(test.question), source: 'skipped' }
				: await input.generate(
						[
							{ role: 'system', content: SYSTEM_PROMPT },
							{ role: 'user', content: buildUserPrompt(test.question, hits) }
						],
						test.question,
						route,
						hits
					)
			: { text: groundedRefusal(test.question), source: 'no-evidence' };
		const answerSource = generationSource(generated);
		const raw =
			answerSource === 'skipped' || answerSource === 'no-evidence'
				? generationText(generated)
				: stripThink(generationText(generated));
		const resolved =
			route === 'synthesis'
				? resolveCitations(raw, hits, test.question)
				: resolveTargetedCitations(raw, hits, test.question);
		const missingAnswerGroups =
			expectedOutcome === 'refusal'
				? []
				: test.answerGroups.filter(
						(group) =>
							!group.some((alternative) => matchesAnswerAlternative(resolved.text, alternative))
					);
		const unexpectedAnswerGroups = (test.forbiddenAnswerGroups ?? []).filter((group) =>
			group.some((alternative) => matchesForbiddenAnswerAlternative(resolved.text, alternative))
		);
		const answerPassed = !generationSkipped && answerMatchesStressOracle(test, resolved.text);
		const citedPages = resolved.citations.map((citation) => citation.hit.page);
		const citationPassed =
			expectedOutcome !== 'refusal'
				? test.pageGroups.every((group) => group.some((page) => citedPages.includes(page)))
				: citedPages.length === 0;
		const result: PrivateDocumentStressResult = {
			id: test.id,
			question: test.question,
			expectedOutcome,
			route,
			passed: retrievalPassed && answerPassed && citationPassed,
			retrievalPassed,
			pageRecallPassed,
			answerGroupTriagePassed,
			answerPassed,
			citationPassed,
			answerBearing,
			alternateQueries,
			retrievedPages,
			retrievedEvidence: hits.map((hit) => ({ page: hit.page, text: hit.text })),
			rawRetrievedPages: retrievedCase.rawRetrievedPages,
			rawRetrievedEvidence: rawHits.map((hit) => ({ page: hit.page, text: hit.text })),
			citedPages,
			missingPageGroups,
			missingAnswerGroups,
			unexpectedAnswerGroups,
			answer: resolved.text,
			answerSource,
			generationSkipped,
			retrievalMs,
			generationMs: generationSkipped ? 0 : performance.now() - generationStartedAt
		};
		results.push(result);
		input.onResult?.(result, results.length, retrievedCases.length);
		input.onGenerationProgress?.(results.length, retrievedCases.length);
	}
	const passed = results.filter((result) => result.passed).length;
	const bySource = results.reduce(
		(accumulator, result) => {
			const bucket = accumulator[result.answerSource];
			bucket.total++;
			if (result.passed) bucket.passed++;
			return accumulator;
		},
		{
			extractive: { total: 0, passed: 0 },
			cached: { total: 0, passed: 0 },
			llm: { total: 0, passed: 0 },
			skipped: { total: 0, passed: 0 },
			'no-evidence': { total: 0, passed: 0 }
		} as Record<StressAnswerSource, { total: number; passed: number }>
	);
	return {
		total: results.length,
		passed,
		bySource,
		retrievalPassed: results.filter((result) => result.retrievalPassed).length,
		pageRecallPassed: results.filter((result) => result.pageRecallPassed).length,
		answerGroupTriagePassed: results.filter((result) => result.answerGroupTriagePassed).length,
		answerPassed: results.filter((result) => result.answerPassed).length,
		citationPassed: results.filter((result) => result.citationPassed).length,
		score: passed / Math.max(results.length, 1),
		failures: results.filter((result) => !result.passed),
		results
	};
}
