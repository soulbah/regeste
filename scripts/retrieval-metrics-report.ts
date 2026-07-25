// Rank-aware retrieval metrics for an archived private-document run.
//
// The 117 scores a case pass/fail on the whole turn, which cannot tell "the
// right passage was rank 1" from "it was rank 14 and the model coped". Every
// archived run already carries the ranked retrieval output, so the rank-aware
// view costs nothing to compute and needs no browser, no model and no reindex.
//
// Two granularities, because they fail differently:
//   page    — did the ranked pages cover the oracle's pages, and how early?
//   passage — how deep is the first passage that actually carries the answer?
//
// Usage: bun scripts/retrieval-metrics-report.ts <run.json> [more-runs.json...]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
	matchesAnswerAlternative,
	parsePrivateDocumentStressMatrix,
	type PrivateDocumentStressCase
} from '../src/lib/benchmark/private-document-stress';
import {
	evaluateRetrieval,
	type RetrievalEvaluation
} from '../src/lib/benchmark/retrieval-metrics';

const MATRIX_PATH = '.benchmark-corpus/private/assurance-stress.json';

interface ArchivedResult {
	id: string;
	rawRetrievedPages: Array<number | null>;
	rawRetrievedEvidence: Array<{ page: number | null; text: string }>;
	retrievalMs: number;
	answerBearing: boolean;
}

/** A retrieved passage is relevant when it carries at least one alternative the
 * oracle accepts. Matching on text rather than a frozen chunk id keeps the
 * metric stable across a reindex, which a chunk-id gold set would not be. */
function isRelevant(passage: string, test: PrivateDocumentStressCase): boolean {
	const groups = test.evidenceGroups ?? test.answerGroups;
	return groups.some((group) =>
		group.some((alternative) => matchesAnswerAlternative(passage, alternative))
	);
}

function firstRank(values: boolean[]): number | null {
	const index = values.indexOf(true);
	return index < 0 ? null : index + 1;
}

function summarize(label: string, ranks: Array<number | null>): string {
	const found = ranks.filter((rank): rank is number => rank !== null);
	const at = (k: number) => found.filter((rank) => rank <= k).length / Math.max(ranks.length, 1);
	const mrr =
		ranks.reduce((sum: number, rank) => sum + (rank !== null && rank <= 10 ? 1 / rank : 0), 0) /
		Math.max(ranks.length, 1);
	const median = found.length
		? [...found].sort((a, b) => a - b)[Math.floor(found.length / 2)]
		: null;
	return [
		`  ${label}`,
		`    hit@1 ${(at(1) * 100).toFixed(1)}%  hit@3 ${(at(3) * 100).toFixed(1)}%  hit@5 ${(at(5) * 100).toFixed(1)}%  hit@10 ${(at(10) * 100).toFixed(1)}%`,
		`    MRR@10 ${mrr.toFixed(3)}   median rank ${median ?? '—'}   never found ${ranks.length - found.length}/${ranks.length}`
	].join('\n');
}

const runPaths = process.argv.slice(2);
if (!runPaths.length) {
	console.error('usage: bun scripts/retrieval-metrics-report.ts <run.json> [...]');
	process.exit(1);
}

const matrix = parsePrivateDocumentStressMatrix(JSON.parse(readFileSync(MATRIX_PATH, 'utf8')));
const caseById = new Map(matrix.cases.map((test) => [test.id, test]));

for (const runPath of runPaths) {
	const parsed: unknown = JSON.parse(readFileSync(runPath, 'utf8'));
	const results = (
		Array.isArray(parsed) ? parsed : ((parsed as { results?: unknown[] }).results ?? [])
	) as ArchivedResult[];

	const pageRanks: Array<number | null> = [];
	const passageRanks: Array<number | null> = [];
	const evaluations: RetrievalEvaluation[] = [];
	const deepest: Array<{ id: string; rank: number }> = [];

	for (const result of results) {
		const test = caseById.get(result.id);
		if (!test) continue;
		const answerable = test.expectedOutcome !== 'refusal';
		const rankedPages = result.rawRetrievedPages ?? [];
		const rankedPassages = result.rawRetrievedEvidence ?? [];

		if (answerable) {
			const wanted = new Set(test.pageGroups.flat());
			pageRanks.push(firstRank(rankedPages.map((page) => page !== null && wanted.has(page))));
			const passageRank = firstRank(
				rankedPassages.map((passage) => isRelevant(passage.text, test))
			);
			passageRanks.push(passageRank);
			if (passageRank !== null && passageRank > 5) deepest.push({ id: test.id, rank: passageRank });
		}

		evaluations.push({
			// One representative per oracle group: a group is satisfied by any of
			// its pages, so counting all of them would punish a correct retrieval.
			expectedIds: answerable ? test.pageGroups.map((group) => `p${group[0]}`) : [],
			// For a case with no answer, what matters is what SURVIVES the
			// answerability gate, not what the raw channels dredged up: the raw
			// list is never empty, so scoring it would report zero precision on a
			// product that refuses correctly.
			retrievedIds:
				!answerable && !result.answerBearing
					? []
					: [...new Set(rankedPages.filter((page) => page !== null))].map((page) => `p${page}`),
			answerable,
			latencyMs: result.retrievalMs
		});
	}

	const metrics = evaluateRetrieval(evaluations);
	console.log(`\n${basename(runPath)}  (${results.length} cases)`);
	console.log(summarize('page rank of first oracle page', pageRanks));
	console.log(summarize('passage rank of first answer-bearing excerpt', passageRanks));
	console.log(
		`  aggregate  recall@5 ${metrics.recallAt5.toFixed(3)}  recall@10 ${metrics.recallAt10.toFixed(3)}  ` +
			`nDCG@10 ${metrics.ndcgAt10.toFixed(3)}  negative precision ${metrics.negativePrecision.toFixed(3)}  ` +
			`p95 ${Math.round(metrics.p95LatencyMs)}ms`
	);
	if (deepest.length) {
		const worst = deepest.sort((a, b) => b.rank - a.rank).slice(0, 8);
		console.log(
			`  answer buried past rank 5 in ${deepest.length} case(s): ` +
				worst.map((entry) => `${entry.id}@${entry.rank}`).join(', ')
		);
	}
}
