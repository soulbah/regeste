/**
 * PP-DocLayout on a page image: what a detection model sees, and what it costs.
 *
 * Spec-033 and the August review both land on the same need — the region types
 * this codebase currently infers from hand-written vocabularies. A `footer` is
 * the block at the bottom of the page, not the block containing "société
 * coopérative"; a `table` is a detected region, not a column whose value density
 * crosses 0.4.
 *
 * Measured against the generative alternative on the same two pages:
 *
 *              granite-docling q8   PP-DocLayout
 *   attestation          20.0 s        0.9 s      20 regions, footer @ 0.95
 *   fee page            123.6 s        1.0 s      22 regions
 *
 * The gap is structural, not tuning. An autoregressive model is billed by the
 * tokens it writes, so a dense page costs six times a sparse one; a detector
 * runs one forward pass whatever the page holds. The detector also has no
 * decoder to fall into a loop and no fp16 graph to overflow.
 *
 * What the detector does NOT give: list nesting. granite-docling returns
 * `<unordered_list>` around the RAPO fee lines; PP-DocLayout returns the same
 * area as flat `text` regions. Richer semantics cost 100x here.
 *
 * Usage: bun scripts/doclayout-probe.ts <page.png> [threshold] [inputSize]
 */
import { DocLayoutService } from 'ppu-doclayout';
import { readFile } from 'node:fs/promises';

const page = process.argv[2] ?? '.scratch/attestation-p1.png';
// The library's default of 0.5 returns four regions on a French letter and
// hides the footer entirely; 0.15 returns twenty and finds it at 0.95. Input
// size must stay at the model's native 800: raising it returns nothing at all.
const threshold = Number(process.argv[3] ?? 0.15);
const modelInputSize = Number(process.argv[4] ?? 800);

const service = new DocLayoutService({
	debugging: { debug: false, verbose: false },
	detection: { threshold, modelInputSize }
});

const initialised = Date.now();
await service.initialize();
const ready = Date.now();
const regions = (await service.analyze(await readFile(page))) as Array<{
	label: string;
	score: number;
	box: [number, number, number, number];
}>;

console.log(
	`init ${((ready - initialised) / 1000).toFixed(1)}s · analyse ${((Date.now() - ready) / 1000).toFixed(1)}s · ${regions.length} regions @ threshold ${threshold}\n`
);
for (const region of [...regions].sort((a, b) => a.box[1] - b.box[1]))
	console.log(
		`  ${region.label.padEnd(16)} ${region.score.toFixed(2)}  y ${region.box[1].toFixed(0).padStart(5)}–${region.box[3].toFixed(0).padStart(5)}`
	);

const counts = new Map<string, number>();
for (const region of regions) counts.set(region.label, (counts.get(region.label) ?? 0) + 1);
console.log('\n', Object.fromEntries([...counts].sort((a, b) => b[1] - a[1])));
await service.destroy();
