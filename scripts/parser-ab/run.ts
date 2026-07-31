// Parser A/B runner: every adapter × every metric over the evaluation corpus.
//
//   bun run parser-ab                 all adapters, all metrics
//   bun run parser-ab -- --only ours,liteparse:hybrid
//   bun run parser-ab -- --json out.json
//
// Nothing here is averaged into a single score. The metrics disagree by
// construction and the disagreements are the finding.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import manifest from '../../benchmarks/parser-ab-manifest.json';
import truth from './truth.json';
import {
	defaultAdapters,
	liteparseAvailable,
	LITEPARSE_PACKAGE,
	oursAdapter,
	type Adapter,
	type AdapterPage
} from './adapters';
import {
	groundTruthSegments,
	htmlToText,
	scoreBinding,
	scoreOrder,
	scoreOrphans,
	scoreSections,
	scoreTriage,
	type BindingPair,
	type SectionItem
} from './metrics';

const root = resolve(import.meta.dir, '../..');
const corpus = resolve(root, manifest.outputDirectory);

const argv = process.argv.slice(2);
const flag = (name: string) => {
	const index = argv.indexOf(`--${name}`);
	return index >= 0 ? argv[index + 1] : undefined;
};

let adapters: Adapter[] = defaultAdapters();
if (!(await liteparseAvailable())) {
	adapters = [oursAdapter];
	console.warn(
		`${LITEPARSE_PACKAGE} is not installed — running the shipped pipeline only.\n` +
			`  bun add -d ${LITEPARSE_PACKAGE}\n`
	);
}
const only = flag('only');
if (only) {
	const wanted = new Set(only.split(','));
	adapters = adapters.filter((adapter) => wanted.has(adapter.id));
	if (!adapters.length) throw new Error(`No adapter matched --only ${only}`);
}

interface Totals {
	binding: { sameLine: number; near: number; wrong: number; missing: number; total: number };
	orphans: { values: number; orphans: number };
	order: { segments: number; recall: number; contiguous: number; inOrderSum: number; docs: number };
	sections: { total: number; clean: number; contaminated: number; absent: number };
	triage: { pages: number; needing: number; falsePositive: number; falseNegative: number };
	ms: number;
	failures: string[];
}

const totals = new Map<string, Totals>();
const blank = (): Totals => ({
	binding: { sameLine: 0, near: 0, wrong: 0, missing: 0, total: 0 },
	orphans: { values: 0, orphans: 0 },
	order: { segments: 0, recall: 0, contiguous: 0, inOrderSum: 0, docs: 0 },
	sections: { total: 0, clean: 0, contaminated: 0, absent: 0 },
	triage: { pages: 0, needing: 0, falsePositive: 0, falseNegative: 0 },
	ms: 0,
	failures: []
});
for (const adapter of adapters) totals.set(adapter.id, blank());

const bindingByFile = new Map<string, { page: number; pairs: BindingPair[] }[]>();
for (const entry of truth.documents) {
	const list = bindingByFile.get(entry.file) ?? [];
	list.push({
		page: entry.page,
		pairs: entry.pairs.map(([label, value]) => ({ label, value }))
	});
	bindingByFile.set(entry.file, list);
}

const sectionsByFile = new Map<string, { page: number; items: SectionItem[] }[]>();
for (const entry of truth.sections ?? []) {
	const list = sectionsByFile.get(entry.file) ?? [];
	list.push({
		page: entry.page,
		items: entry.items.map(([item, section]) => ({ item, section }))
	});
	sectionsByFile.set(entry.file, list);
}

// Reference text layer for OCR triage: one shared pdf.js extraction, so every
// adapter is judged against the same pages rather than against its own output.
const referenceCache = new Map<string, string[]>();
async function referenceText(file: string, bytes: Uint8Array): Promise<string[]> {
	if (!referenceCache.has(file)) {
		const result = await oursAdapter.parse(bytes);
		referenceCache.set(
			file,
			result.pages.map((page) => page.citationText)
		);
	}
	return referenceCache.get(file)!;
}

interface DocumentCell {
	ms: number;
	pages: number;
	binding?: { sameLine: number; near: number; wrong: number; total: number };
	sections?: { clean: number; contaminated: number; total: number };
	order?: { recall: number; contiguous: number };
	triage?: { fp: number; fn: number; need: number };
}
interface DocumentRow {
	document: string;
	class: string;
	adapters: Record<string, DocumentCell>;
}

const perDocument: DocumentRow[] = [];

for (const entry of manifest.files) {
	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await readFile(resolve(corpus, entry.name)));
	} catch {
		console.warn(`missing (run bun run parser-ab:fetch): ${entry.name}`);
		continue;
	}
	const reference = await referenceText(entry.name, bytes);

	let orderTruth: string[] | null = null;
	if ('htmlTwin' in entry && entry.htmlTwin) {
		try {
			const html = await readFile(resolve(corpus, entry.htmlTwin.name), 'utf8');
			const segments = groundTruthSegments(htmlToText(html));
			if (segments.length >= 50) orderTruth = segments;
		} catch {
			/* twin absent */
		}
	}

	const row: DocumentRow = { document: entry.name, class: entry.class, adapters: {} };
	for (const adapter of adapters) {
		const accumulated = totals.get(adapter.id)!;
		let pages: AdapterPage[];
		let ms: number;
		try {
			const result = await adapter.parse(bytes);
			pages = result.pages;
			ms = result.ms;
		} catch (error) {
			console.error(`  ${adapter.id} failed on ${entry.name}: ${(error as Error).message}`);
			continue;
		}
		accumulated.ms += ms;

		const cell: DocumentCell = { ms: Math.round(ms), pages: pages.length };

		for (const target of bindingByFile.get(entry.name) ?? []) {
			const page = pages.find((candidate) => candidate.page === target.page);
			const score = scoreBinding(page?.retrievalText ?? '', target.pairs);
			accumulated.binding.sameLine += score.sameLine;
			accumulated.binding.near += score.near;
			accumulated.binding.wrong += score.wrong;
			accumulated.binding.missing += score.missing;
			accumulated.binding.total += score.total;
			accumulated.failures.push(
				...score.failures.map((line) => `${entry.name} p${target.page}: ${line}`)
			);
			cell.binding ??= { sameLine: 0, near: 0, wrong: 0, total: 0 };
			cell.binding.sameLine += score.sameLine;
			cell.binding.near += score.near;
			cell.binding.wrong += score.wrong;
			cell.binding.total += score.total;
		}

		for (const target of sectionsByFile.get(entry.name) ?? []) {
			const page = pages.find((candidate) => candidate.page === target.page);
			const score = scoreSections(page?.retrievalText ?? '', target.items);
			accumulated.sections.total += score.total;
			accumulated.sections.clean += score.clean;
			accumulated.sections.contaminated += score.contaminated;
			accumulated.sections.absent += score.absent;
			accumulated.failures.push(
				...score.failures.map((line) => `${entry.name} p${target.page}: ${line}`)
			);
			cell.sections = { clean: score.clean, contaminated: score.contaminated, total: score.total };
		}

		for (const page of pages) {
			const orphan = scoreOrphans(page.retrievalText);
			accumulated.orphans.values += orphan.values;
			accumulated.orphans.orphans += orphan.orphans;
		}

		if (orderTruth) {
			const order = scoreOrder(pages.map((page) => page.retrievalText).join('\n'), orderTruth);
			accumulated.order.segments += order.segments;
			accumulated.order.recall += order.recall;
			accumulated.order.contiguous += order.contiguous;
			accumulated.order.inOrderSum += order.inOrder;
			accumulated.order.docs++;
			cell.order = {
				recall: +((order.recall / order.segments) * 100).toFixed(1),
				contiguous: +((order.contiguous / order.segments) * 100).toFixed(1)
			};
		}

		const triage = scoreTriage(pages, reference);
		accumulated.triage.pages += triage.pages;
		accumulated.triage.needing += triage.needing;
		accumulated.triage.falsePositive += triage.falsePositive;
		accumulated.triage.falseNegative += triage.falseNegative;
		cell.triage = { fp: triage.falsePositive, fn: triage.falseNegative, need: triage.needing };

		row.adapters[adapter.id] = cell;
	}
	perDocument.push(row);
	console.log(
		`${entry.name.padEnd(34)} ${String(row.adapters[adapters[0].id]?.pages ?? 0).padStart(4)}p  ` +
			adapters.map((adapter) => `${adapter.id}=${row.adapters[adapter.id]?.ms ?? '-'}ms`).join('  ')
	);
}

// --- report ---------------------------------------------------------------

const pct = (part: number, whole: number) =>
	whole ? `${((part / whole) * 100).toFixed(0)}%`.padStart(4) : '   -';

console.log(`\n${'='.repeat(96)}`);
console.log('1. LABEL→VALUE BINDING  (hand-verified pairs; WRONG = a different value sits closer)');
console.log(
	`${'adapter'.padEnd(26)}${'same line'.padStart(12)}${'in chunk'.padStart(12)}${'WRONG'.padStart(8)}${'absent'.padStart(8)}`
);
for (const adapter of adapters) {
	const b = totals.get(adapter.id)!.binding;
	console.log(
		adapter.id.padEnd(26) +
			`${pct(b.sameLine, b.total)} ${String(b.sameLine).padStart(3)}/${b.total}`.padStart(12) +
			`${pct(b.near, b.total)} ${String(b.near).padStart(3)}/${b.total}`.padStart(12) +
			String(b.wrong).padStart(8) +
			String(b.missing).padStart(8)
	);
}

console.log(`\n2. ORPHAN VALUES  (whole corpus, no labels; direction only — see README)`);
console.log(`${'adapter'.padEnd(26)}${'orphaned'.padStart(16)}`);
for (const adapter of adapters) {
	const o = totals.get(adapter.id)!.orphans;
	console.log(
		adapter.id.padEnd(26) + `${pct(o.orphans, o.values)} ${o.orphans}/${o.values}`.padStart(16)
	);
}

console.log(`\n3. READING ORDER  (vs publisher HTML of the same act)`);
console.log(
	`${'adapter'.padEnd(26)}${'recall'.padStart(10)}${'CONTIGUOUS'.padStart(12)}${'in order'.padStart(10)}`
);
for (const adapter of adapters) {
	const o = totals.get(adapter.id)!.order;
	if (!o.segments) continue;
	console.log(
		adapter.id.padEnd(26) +
			pct(o.recall, o.segments).padStart(10) +
			pct(o.contiguous, o.segments).padStart(12) +
			`${((o.inOrderSum / o.docs) * 100).toFixed(0)}%`.padStart(10)
	);
}

console.log(`\n4. CROSS-SECTION CONTAMINATION  (MIXED = covered peril and exclusion on one line)`);
console.log(
	`${'adapter'.padEnd(26)}${'clean'.padStart(14)}${'MIXED'.padStart(10)}${'absent'.padStart(8)}`
);
for (const adapter of adapters) {
	const s = totals.get(adapter.id)!.sections;
	if (!s.total) continue;
	console.log(
		adapter.id.padEnd(26) +
			`${pct(s.clean, s.total)} ${s.clean}/${s.total}`.padStart(14) +
			String(s.contaminated).padStart(10) +
			String(s.absent).padStart(8)
	);
}

console.log(`\n5. OCR TRIAGE  (pages whose text layer is unusable)`);
console.log(
	`${'adapter'.padEnd(26)}${'need OCR'.padStart(10)}${'false pos'.padStart(11)}${'FALSE NEG'.padStart(11)}`
);
for (const adapter of adapters) {
	const t = totals.get(adapter.id)!.triage;
	console.log(
		adapter.id.padEnd(26) +
			`${t.needing}/${t.pages}`.padStart(10) +
			String(t.falsePositive).padStart(11) +
			String(t.falseNegative).padStart(11)
	);
}

console.log(`\n6. COST`);
console.log(`${'adapter'.padEnd(26)}${'total parse'.padStart(14)}`);
for (const adapter of adapters)
	console.log(
		adapter.id.padEnd(26) + `${(totals.get(adapter.id)!.ms / 1000).toFixed(1)}s`.padStart(14)
	);

const jsonPath = flag('json');
if (jsonPath) {
	await writeFile(
		resolve(process.cwd(), jsonPath),
		JSON.stringify(
			{
				generatedFrom: manifest.outputDirectory,
				adapters: adapters.map((adapter) => ({ id: adapter.id, note: adapter.note })),
				totals: Object.fromEntries(totals),
				perDocument
			},
			null,
			2
		)
	);
	console.log(`\nwrote ${jsonPath}`);
}

if (argv.includes('--failures')) {
	for (const adapter of adapters) {
		const failures = totals.get(adapter.id)!.failures;
		if (!failures.length) continue;
		console.log(`\n--- ${adapter.id}: ${failures.length} binding failures ---`);
		for (const line of failures) console.log(`  ${line}`);
	}
}
