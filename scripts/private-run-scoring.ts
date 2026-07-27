// Shared scoring for archived private-document runs.
//
// Two gates depend on the oracle — the answer verdict and the retrieval
// evidence triage — so a scoring change has to be replayed on both or a report
// quotes a stale number for the half it did not touch. Both tools read this so
// they cannot disagree with each other.
import { readFileSync } from 'node:fs';
import {
	answerMatchesStressOracle,
	evidenceCoversAnswerGroups,
	parsePrivateDocumentStressMatrix,
	type PrivateDocumentStressCase
} from '../src/lib/benchmark/private-document-stress';

/** The dev corpus by default; set BENCH_MATRIX to score a held-out set. */
export const MATRIX_PATH =
	process.env.BENCH_MATRIX ?? '.benchmark-corpus/private/assurance-stress.json';

export interface ArchivedResult {
	id: string;
	question: string;
	answer: string;
	passed: boolean;
	retrievalPassed: boolean;
	pageRecallPassed: boolean;
	answerBearing: boolean;
	answerPassed: boolean;
	citationPassed: boolean;
	generationSkipped: boolean;
	answerSource?: string;
	rawRetrievedEvidence?: Array<{ page: number | null; text: string }>;
	evidence?: Array<{ page: number | null; text: string }>;
	rawRetrievedPages?: Array<number | null>;
	citedPages?: Array<number | null>;
	retrievalMs?: number;
}

export interface ScoredResult extends ArchivedResult {
	/** Verdicts recomputed under the current oracle. */
	scored: { retrieval: boolean; answer: boolean; citation: boolean; passed: boolean };
}

export function loadMatrix(): Map<string, PrivateDocumentStressCase> {
	const matrix = parsePrivateDocumentStressMatrix(JSON.parse(readFileSync(MATRIX_PATH, 'utf8')));
	return new Map(matrix.cases.map((test) => [test.id, test]));
}

/** Full runs archive the ordered evidence as `rawRetrievedEvidence`; the
 * model-free gate emits the same list as `evidence`. */
export function orderedEvidence(
	result: ArchivedResult
): Array<{ page: number | null; text: string }> {
	return result.rawRetrievedEvidence ?? result.evidence ?? [];
}

function retrievalVerdict(test: PrivateDocumentStressCase, result: ArchivedResult): boolean {
	if (test.expectedOutcome === 'refusal') return !result.answerBearing;
	const texts = orderedEvidence(result).map((item) => item.text);
	// An archive without the evidence texts cannot be replayed; keep what it
	// recorded rather than inventing a verdict.
	if (!texts.length) return result.retrievalPassed;
	return (
		result.answerBearing &&
		result.pageRecallPassed &&
		evidenceCoversAnswerGroups(texts, test.evidenceGroups ?? test.answerGroups)
	);
}

/** A cited page satisfies a group; a refusal must cite nothing at all. */
function citationVerdict(
	test: PrivateDocumentStressCase,
	citedPages: Array<number | null>
): boolean {
	if (test.expectedOutcome === 'refusal') return citedPages.length === 0;
	return test.pageGroups.every((group) => group.some((page) => citedPages.includes(page)));
}

/** What a run recorded about itself. Absent on anything archived before runs
 * started stamping it, which is why every field is optional. */
export interface RunProvenance {
	commit?: string;
	model?: string;
	matrix?: string;
	matrixSha?: string;
	mode?: string;
	generated?: number;
	reusedFromCache?: number;
	replayMisses?: number;
	wallSeconds?: number;
	finishedAt?: string;
}

export function readProvenance(path: string): RunProvenance | null {
	const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
	if (Array.isArray(parsed)) return null;
	return (parsed as { provenance?: RunProvenance }).provenance ?? null;
}

/** One line naming what produced a number, so two result files sitting side by
 * side can be told apart without grepping their answers. */
export function provenanceLine(path: string): string {
	const p = readProvenance(path);
	if (!p) return '  (no provenance: archived before runs stamped themselves)';
	const cost =
		p.generated === undefined
			? ''
			: ` · ${p.generated} generated, ${p.reusedFromCache} reused in ${p.wallSeconds}s`;
	// A replay miss is not a detail to bury at the end of a line: the score above
	// it is wrong by that many cases.
	const holes = p.replayMisses
		? `\n  ${p.replayMisses} REPLAY MISSES — this score is incomplete`
		: '';
	return `  ${p.commit ?? '?'} · ${p.model ?? '?'} · ${p.mode ?? '?'}${cost}${holes}`;
}

export function loadScoredRun(
	path: string,
	cases: Map<string, PrivateDocumentStressCase>
): ScoredResult[] {
	const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
	const results = (
		Array.isArray(parsed) ? parsed : ((parsed as { results?: unknown[] }).results ?? [])
	) as ArchivedResult[];
	return results.flatMap((result) => {
		const test = cases.get(result.id);
		if (!test) return [];
		const retrieval = retrievalVerdict(test, result);
		const answer = !result.generationSkipped && answerMatchesStressOracle(test, result.answer);
		// All three gates depend on the oracle, so all three are replayed. Leaving
		// the citation verdict as archived meant a correction to which pages carry
		// a fact could not be re-scored without an hour-long re-run.
		const citation = result.citedPages
			? citationVerdict(test, result.citedPages)
			: result.citationPassed;
		return [
			{
				...result,
				scored: { retrieval, answer, citation, passed: retrieval && answer && citation }
			}
		];
	});
}

/** R/A/C, lowercase where the gate failed. A case can pass for a different
 * reason than it did before, which a pass/fail diff alone would hide. */
export function gateLabel(result: ScoredResult): string {
	return [
		result.scored.retrieval ? 'R' : 'r',
		result.scored.answer ? 'A' : 'a',
		result.scored.citation ? 'C' : 'c'
	].join('');
}
