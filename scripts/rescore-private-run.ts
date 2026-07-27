// Re-score archived private-document runs against the current oracle, offline.
// The archive carries every answer and its retrieved evidence, so this needs no
// browser, no model and no reindex: it answers "how much of that score survives
// a scoring change?" for free, which is the only honest way to compare a run
// taken under one oracle with a number quoted under another.
//
// Usage: bun scripts/rescore-private-run.ts <run.json> [more-runs.json...]
import { basename } from 'node:path';
import { gateLabel, loadMatrix, loadScoredRun, provenanceLine } from './private-run-scoring';

const runPaths = process.argv.slice(2);
if (!runPaths.length) {
	console.error('usage: bun scripts/rescore-private-run.ts <run.json> [...]');
	process.exit(1);
}

const cases = loadMatrix();

for (const runPath of runPaths) {
	const results = loadScoredRun(runPath, cases);
	const archived = results.filter((result) => result.passed).length;
	const rescored = results.filter((result) => result.scored.passed).length;

	const bySource = new Map<string, { total: number; passed: number }>();
	const flips: string[] = [];
	for (const result of results) {
		const source = result.answerSource ?? 'unrecorded';
		const bucket = bySource.get(source) ?? { total: 0, passed: 0 };
		bucket.total++;
		if (result.scored.passed) bucket.passed++;
		bySource.set(source, bucket);
		if (result.passed !== result.scored.passed) {
			flips.push(
				`${result.passed ? 'PASS→FAIL' : 'FAIL→PASS'}  ${result.id}  ${gateLabel(result)}\n` +
					`      q: ${result.question}\n` +
					`      a: ${String(result.answer).replace(/\s+/g, ' ').slice(0, 220)}`
			);
		}
	}

	console.log(`\n${basename(runPath)}`);
	console.log(provenanceLine(runPath));
	console.log(
		`  as archived ${archived}/${results.length}   under the current oracle ${rescored}/${results.length}`
	);
	for (const [source, bucket] of [...bySource].sort()) {
		console.log(`    ${source}: ${bucket.passed}/${bucket.total}`);
	}
	if (flips.length) {
		console.log(`  ${flips.length} flip(s):`);
		for (const line of flips) console.log(`    ${line}`);
	}
}
