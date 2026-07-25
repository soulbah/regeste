// Case-by-case diff of two private-document runs, so a score change can be
// read as "which cases moved and why" instead of a single number.
//
// Usage: bun scripts/compare-private-runs.ts <before.json> <after.json>
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

interface Result {
	id: string;
	question: string;
	passed: boolean;
	retrievalPassed: boolean;
	answerPassed: boolean;
	citationPassed: boolean;
	answerBearing: boolean;
	answerSource?: string;
	answer: string;
}

function load(path: string): Map<string, Result> {
	const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
	const results = (
		Array.isArray(parsed) ? parsed : ((parsed as { results?: unknown[] }).results ?? [])
	) as Result[];
	return new Map(results.map((result) => [result.id, result]));
}

/** Which of the three gates changed. A case can pass overall for a different
 * reason than it did before, which a pass/fail diff alone would hide. */
function gates(result: Result): string {
	return [
		result.retrievalPassed ? 'R' : 'r',
		result.answerPassed ? 'A' : 'a',
		result.citationPassed ? 'C' : 'c'
	].join('');
}

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
	console.error('usage: bun scripts/compare-private-runs.ts <before.json> <after.json>');
	process.exit(1);
}

const before = load(beforePath);
const after = load(afterPath);

const gained: string[] = [];
const lost: string[] = [];
const churned: string[] = [];

for (const [id, next] of after) {
	const prior = before.get(id);
	if (!prior) continue;
	if (!prior.passed && next.passed) gained.push(`  + ${id}  ${gates(prior)} → ${gates(next)}`);
	else if (prior.passed && !next.passed) {
		lost.push(
			`  - ${id}  ${gates(prior)} → ${gates(next)}  [${next.answerSource ?? '?'}]\n` +
				`      q: ${next.question}\n` +
				`      a: ${String(next.answer).replace(/\s+/g, ' ').slice(0, 200)}`
		);
	} else if (gates(prior) !== gates(next)) {
		churned.push(
			`  ~ ${id}  ${gates(prior)} → ${gates(next)} (still ${next.passed ? 'pass' : 'fail'})`
		);
	}
}

const count = (map: Map<string, Result>) => [...map.values()].filter((r) => r.passed).length;
console.log(`${basename(beforePath)} ${count(before)}/${before.size}`);
console.log(`${basename(afterPath)} ${count(after)}/${after.size}`);
console.log(
	`\ngained ${gained.length}, lost ${lost.length}, same verdict but different gates ${churned.length}`
);
if (gained.length) console.log(`\ngained:\n${gained.join('\n')}`);
if (lost.length) console.log(`\nlost:\n${lost.join('\n')}`);
if (churned.length) console.log(`\ngate churn:\n${churned.join('\n')}`);

// Where the surviving failures sit, so the next change has a target.
const stillFailing = [...after.values()].filter((result) => !result.passed);
if (stillFailing.length) {
	const byGate = new Map<string, string[]>();
	for (const result of stillFailing) {
		const key = gates(result);
		byGate.set(key, [...(byGate.get(key) ?? []), result.id]);
	}
	console.log('\nfailures by gate (R=retrieval A=answer C=citation, lowercase = failed):');
	for (const [key, ids] of [...byGate].sort()) console.log(`  ${key}  ${ids.join(', ')}`);
}
