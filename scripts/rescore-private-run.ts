// Re-score an archived private-document benchmark run against the current
// oracle, offline. The archive carries every answer, so this needs no browser,
// no model and no reindex: it answers "how much of that score survives a
// scoring change?" for free, which is the only honest way to compare a run
// taken under one oracle with a number quoted under another.
//
// Usage: bun scripts/rescore-private-run.ts <run.json> [more-runs.json...]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
	answerMatchesStressOracle,
	parsePrivateDocumentStressMatrix,
	type PrivateDocumentStressCase
} from '../src/lib/benchmark/private-document-stress';

const MATRIX_PATH = '.benchmark-corpus/private/assurance-stress.json';

interface ArchivedResult {
	id: string;
	answer: string;
	passed: boolean;
	retrievalPassed: boolean;
	citationPassed: boolean;
	generationSkipped: boolean;
	answerSource?: string;
}

const runPaths = process.argv.slice(2);
if (!runPaths.length) {
	console.error('usage: bun scripts/rescore-private-run.ts <run.json> [...]');
	process.exit(1);
}

const matrix = parsePrivateDocumentStressMatrix(JSON.parse(readFileSync(MATRIX_PATH, 'utf8')));
const caseById = new Map<string, PrivateDocumentStressCase>(
	matrix.cases.map((test) => [test.id, test])
);

for (const runPath of runPaths) {
	const parsed: unknown = JSON.parse(readFileSync(runPath, 'utf8'));
	const results = (
		Array.isArray(parsed) ? parsed : ((parsed as { results?: unknown[] }).results ?? [])
	) as ArchivedResult[];

	let archived = 0;
	let rescored = 0;
	const flips: string[] = [];
	const bySource = new Map<string, { total: number; passed: number }>();

	for (const result of results) {
		const test = caseById.get(result.id);
		if (!test) {
			console.error(`  ! ${result.id} is not in the matrix — skipped`);
			continue;
		}
		const answerPassed =
			!result.generationSkipped && answerMatchesStressOracle(test, result.answer);
		const passed = result.retrievalPassed && answerPassed && result.citationPassed;
		if (result.passed) archived++;
		if (passed) rescored++;
		const source = result.answerSource ?? 'unrecorded';
		const bucket = bySource.get(source) ?? { total: 0, passed: 0 };
		bucket.total++;
		if (passed) bucket.passed++;
		bySource.set(source, bucket);
		if (result.passed !== passed) {
			flips.push(
				`${result.passed ? 'PASS→FAIL' : 'FAIL→PASS'}  ${result.id} [${test.expectedOutcome}]\n` +
					`      q: ${test.question}\n` +
					`      a: ${String(result.answer).replace(/\s+/g, ' ').slice(0, 220)}`
			);
		}
	}

	console.log(`\n${basename(runPath)}`);
	console.log(
		`  archived ${archived}/${results.length}   current oracle ${rescored}/${results.length}`
	);
	for (const [source, bucket] of [...bySource].sort()) {
		console.log(`    ${source}: ${bucket.passed}/${bucket.total}`);
	}
	if (flips.length) {
		console.log(`  ${flips.length} flip(s):`);
		for (const line of flips) console.log(`    ${line}`);
	}
}
