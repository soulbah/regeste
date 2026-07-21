import type { PrivateDocumentStressResult } from './private-document-stress';

export const PRIVATE_RUN_CACHE_VERSION = 1;
export const PRIVATE_GENERATION_CACHE_STORAGE_KEY = 'regeste:dev-private-generation-cache-v1';
export const PRIVATE_RUN_CHECKPOINT_STORAGE_KEY = 'regeste:dev-private-run-checkpoint-v1';

export type PrivateHumanVerdict = 'pass' | 'fail' | 'oracle-invalid';

export interface PrivateHumanReview {
	verdict: PrivateHumanVerdict;
	note: string;
	reviewedAt: number;
}

export interface CompactPrivateRunResult {
	id: string;
	question: string;
	expectedOutcome: PrivateDocumentStressResult['expectedOutcome'];
	answer: string;
	passed: boolean;
	retrievalPassed: boolean;
	pageRecallPassed: boolean;
	answerGroupTriagePassed: boolean;
	answerPassed: boolean;
	citationPassed: boolean;
	answerBearing: boolean;
	alternateQueries: string[];
	rawRetrievedPages: Array<number | null>;
	retrievedPages: Array<number | null>;
	citedPages: Array<number | null>;
	missingPageGroups: number[][];
	missingAnswerGroups: string[][];
	unexpectedAnswerGroups: string[][];
	rawRetrievedEvidence: Array<{ page: number | null; text: string }>;
	generationSkipped: boolean;
	retrievalMs: number;
	generationMs: number;
}

export interface PrivateRunCheckpoint {
	version: number;
	runId: string;
	documentName: string;
	documentHash: string;
	retrievalVersion: number;
	model: string;
	total: number;
	completed: number;
	startedAt: number;
	updatedAt: number;
	results: CompactPrivateRunResult[];
	humanReviews: Record<string, PrivateHumanReview>;
}

function parseRecord(value: string | null): Record<string, string> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string'
			)
		);
	} catch {
		return {};
	}
}

export function loadGenerationCache(storage: Pick<Storage, 'getItem'>): Map<string, string> {
	return new Map(
		Object.entries(parseRecord(storage.getItem(PRIVATE_GENERATION_CACHE_STORAGE_KEY)))
	);
}

export function saveGenerationCache(
	storage: Pick<Storage, 'setItem'>,
	cache: ReadonlyMap<string, string>
): void {
	storage.setItem(PRIVATE_GENERATION_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(cache)));
}

export async function sha256Text(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function privateGenerationCacheKey(input: {
	model: string;
	documentHash: string;
	retrievalVersion: number;
	question: string;
	route: 'targeted' | 'synthesis';
	options: unknown;
	messages: Array<{ role: string; content: string }>;
}): Promise<string> {
	return sha256Text(JSON.stringify({ version: PRIVATE_RUN_CACHE_VERSION, ...input }));
}

export function compactPrivateRunResult(
	result: PrivateDocumentStressResult
): CompactPrivateRunResult {
	return {
		id: result.id,
		question: result.question,
		expectedOutcome: result.expectedOutcome,
		answer: result.answer,
		passed: result.passed,
		retrievalPassed: result.retrievalPassed,
		pageRecallPassed: result.pageRecallPassed,
		answerGroupTriagePassed: result.answerGroupTriagePassed,
		answerPassed: result.answerPassed,
		citationPassed: result.citationPassed,
		answerBearing: result.answerBearing,
		alternateQueries: result.alternateQueries,
		rawRetrievedPages: result.rawRetrievedPages,
		retrievedPages: result.retrievedPages,
		citedPages: result.citedPages,
		missingPageGroups: result.missingPageGroups,
		missingAnswerGroups: result.missingAnswerGroups,
		unexpectedAnswerGroups: result.unexpectedAnswerGroups,
		rawRetrievedEvidence: result.rawRetrievedEvidence.map((item) => ({
			page: item.page,
			text: item.text.slice(0, 700)
		})),
		generationSkipped: result.generationSkipped,
		retrievalMs: result.retrievalMs,
		generationMs: result.generationMs
	};
}

/** Append benchmark progress without overwriting reviews written while the
 * generation loop was awaiting the model. */
export function appendPrivateRunResult(
	checkpoint: PrivateRunCheckpoint,
	result: PrivateDocumentStressResult,
	latestHumanReviews: Record<string, PrivateHumanReview>,
	completed: number,
	updatedAt = Date.now()
): PrivateRunCheckpoint {
	return {
		...checkpoint,
		completed,
		updatedAt,
		results: [...checkpoint.results, compactPrivateRunResult(result)],
		humanReviews: { ...checkpoint.humanReviews, ...latestHumanReviews }
	};
}

export function savePrivateRunCheckpoint(
	storage: Pick<Storage, 'setItem'>,
	checkpoint: PrivateRunCheckpoint
): void {
	storage.setItem(PRIVATE_RUN_CHECKPOINT_STORAGE_KEY, JSON.stringify(checkpoint));
}

export function loadPrivateRunCheckpoint(
	storage: Pick<Storage, 'getItem'>
): PrivateRunCheckpoint | null {
	const raw = storage.getItem(PRIVATE_RUN_CHECKPOINT_STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as PrivateRunCheckpoint;
		if (
			parsed.version !== PRIVATE_RUN_CACHE_VERSION ||
			typeof parsed.runId !== 'string' ||
			!Array.isArray(parsed.results) ||
			parsed.completed !== parsed.results.length
		)
			return null;
		return parsed;
	} catch {
		return null;
	}
}

/** Cases a resumed run still has to execute: everything the saved checkpoint
 * has not completed yet. Resume never re-runs or overwrites the saved prefix. */
export function remainingCheckpointCases<T extends { id: string }>(
	cases: readonly T[],
	checkpoint: PrivateRunCheckpoint
): T[] {
	const completed = new Set(checkpoint.results.map((result) => result.id));
	return cases.filter((test) => !completed.has(test.id));
}

export interface ConsolidatedPrivateRunReport {
	kind: 'private-benchmark-consolidated';
	version: number;
	runId: string;
	documentName: string;
	documentHash: string;
	retrievalVersion: number;
	model: string;
	startedAt: number;
	updatedAt: number;
	total: number;
	completed: number;
	complete: boolean;
	automatic: {
		passed: number;
		retrievalPassed: number;
		pageRecallPassed: number;
		answerGroupTriagePassed: number;
		answerPassed: number;
		citationPassed: number;
		score: number;
	};
	humanReview: ReturnType<typeof humanReviewSummary>;
	/** Automatic result corrected by explicit human verdicts: `pass` and
	 * `oracle-invalid` count as humanly correct+sourced, `fail` never does,
	 * unreviewed cases keep their automatic verdict. */
	humanCorrect: { passed: number; score: number };
	automaticFailureIds: string[];
	humanFailureIds: string[];
	oracleInvalidIds: string[];
	results: Array<
		CompactPrivateRunResult & {
			humanVerdict: PrivateHumanVerdict | null;
			humanNote: string | null;
		}
	>;
}

export function buildConsolidatedReport(
	checkpoint: PrivateRunCheckpoint
): ConsolidatedPrivateRunReport {
	const results = checkpoint.results.map((result) => ({
		...result,
		humanVerdict: checkpoint.humanReviews[result.id]?.verdict ?? null,
		humanNote: checkpoint.humanReviews[result.id]?.note ?? null
	}));
	const humanlyCorrect = (result: (typeof results)[number]) =>
		result.humanVerdict === null ? result.passed : result.humanVerdict !== 'fail';
	const denominator = Math.max(results.length, 1);
	return {
		kind: 'private-benchmark-consolidated',
		version: PRIVATE_RUN_CACHE_VERSION,
		runId: checkpoint.runId,
		documentName: checkpoint.documentName,
		documentHash: checkpoint.documentHash,
		retrievalVersion: checkpoint.retrievalVersion,
		model: checkpoint.model,
		startedAt: checkpoint.startedAt,
		updatedAt: checkpoint.updatedAt,
		total: checkpoint.total,
		completed: checkpoint.completed,
		complete: checkpoint.completed === checkpoint.total,
		automatic: {
			passed: results.filter((result) => result.passed).length,
			retrievalPassed: results.filter((result) => result.retrievalPassed).length,
			pageRecallPassed: results.filter((result) => result.pageRecallPassed).length,
			answerGroupTriagePassed: results.filter((result) => result.answerGroupTriagePassed).length,
			answerPassed: results.filter((result) => result.answerPassed).length,
			citationPassed: results.filter((result) => result.citationPassed).length,
			score: results.filter((result) => result.passed).length / denominator
		},
		humanReview: humanReviewSummary(checkpoint),
		humanCorrect: {
			passed: results.filter(humanlyCorrect).length,
			score: results.filter(humanlyCorrect).length / denominator
		},
		automaticFailureIds: results.filter((result) => !result.passed).map((result) => result.id),
		humanFailureIds: results.filter((result) => !humanlyCorrect(result)).map((result) => result.id),
		oracleInvalidIds: results
			.filter((result) => result.humanVerdict === 'oracle-invalid')
			.map((result) => result.id),
		results
	};
}

export function humanReviewSummary(checkpoint: PrivateRunCheckpoint): {
	reviewed: number;
	passed: number;
	failed: number;
	oracleInvalid: number;
	complete: boolean;
} {
	const reviews = checkpoint.results
		.map((result) => checkpoint.humanReviews[result.id])
		.filter((review): review is PrivateHumanReview => Boolean(review));
	const passed = reviews.filter((review) => review.verdict === 'pass').length;
	const failed = reviews.filter((review) => review.verdict === 'fail').length;
	const oracleInvalid = reviews.filter((review) => review.verdict === 'oracle-invalid').length;
	return {
		reviewed: reviews.length,
		passed,
		failed,
		oracleInvalid,
		complete: checkpoint.completed === checkpoint.total && reviews.length === checkpoint.total
	};
}
