// Case-by-case diff of two private-document runs, so a score change reads as
// "which cases moved and through which gate" instead of a single number.
// Both sides are scored under the current oracle, so a scoring change cannot
// masquerade as a pipeline change.
//
// Usage: bun scripts/compare-private-runs.ts <before.json> <after.json>
import { basename } from 'node:path';
import {
	gateLabel,
	loadMatrix,
	loadScoredRun,
	provenanceLine,
	type ScoredResult
} from './private-run-scoring';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
	console.error('usage: bun scripts/compare-private-runs.ts <before.json> <after.json>');
	process.exit(1);
}

const cases = loadMatrix();
const index = (results: ScoredResult[]) => new Map(results.map((result) => [result.id, result]));
const before = index(loadScoredRun(beforePath, cases));
const after = index(loadScoredRun(afterPath, cases));

const gained: string[] = [];
const lost: string[] = [];
const churned: string[] = [];

for (const [id, next] of after) {
	const prior = before.get(id);
	if (!prior) continue;
	const move = `${gateLabel(prior)} → ${gateLabel(next)}`;
	if (!prior.scored.passed && next.scored.passed) gained.push(`  + ${id}  ${move}`);
	else if (prior.scored.passed && !next.scored.passed) {
		lost.push(
			`  - ${id}  ${move}  [${next.answerSource ?? 'unrecorded'}]\n` +
				`      q: ${next.question}\n` +
				`      a: ${String(next.answer).replace(/\s+/g, ' ').slice(0, 220)}`
		);
	} else if (gateLabel(prior) !== gateLabel(next)) {
		churned.push(`  ~ ${id}  ${move} (still ${next.scored.passed ? 'pass' : 'fail'})`);
	}
}

const score = (map: Map<string, ScoredResult>) =>
	`${[...map.values()].filter((result) => result.scored.passed).length}/${map.size}`;
console.log(`${basename(beforePath)} ${score(before)}`);
console.log(provenanceLine(beforePath));
console.log(`${basename(afterPath)} ${score(after)}`);
console.log(provenanceLine(afterPath));
console.log(
	`\ngained ${gained.length}, lost ${lost.length}, same verdict through different gates ${churned.length}`
);
if (gained.length) console.log(`\ngained:\n${gained.join('\n')}`);
if (lost.length) console.log(`\nlost:\n${lost.join('\n')}`);
if (churned.length) console.log(`\ngate churn:\n${churned.join('\n')}`);

// Where the surviving failures sit, so the next change has a target.
const stillFailing = [...after.values()].filter((result) => !result.scored.passed);
if (stillFailing.length) {
	const byGate = new Map<string, string[]>();
	for (const result of stillFailing) {
		const key = gateLabel(result);
		byGate.set(key, [...(byGate.get(key) ?? []), result.id]);
	}
	console.log('\nfailures by gate (R retrieval, A answer, C citation; lowercase failed):');
	for (const [key, ids] of [...byGate].sort()) console.log(`  ${key}  ${ids.join(', ')}`);
}
