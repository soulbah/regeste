// Drive the model-free retrieval gate headlessly and print its report as JSON.
//
// The full 117 needs a 4B model and about an hour, which is why retrieval
// changes were being shipped on spot checks. This path runs no model at all and
// finishes in minutes, so a ranking change can be measured before it is
// believed. Pipe the output into scripts/retrieval-metrics-report.ts for the
// rank-aware view.
//
// Requires the persistent Chromium from .benchmark-corpus/scripts/bench-browser.mjs
// (CDP on 9223) and a dev server on 5173, with the corpus already ingested.
//
// Usage: node scripts/bench-retrieval.mjs [matrix.json] > run.json
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const matrixPath = process.argv[2] ?? '.benchmark-corpus/private/assurance-stress.json';
const matrix = readFileSync(matrixPath, 'utf8');
const total = JSON.parse(matrix).cases.length;

// A page holding a multi-gigabyte model in VRAM answers the first CDP round
// trip slowly; the 30 s default turns that into a spurious connect failure.
const cdp = await chromium.connectOverCDP('http://localhost:9223', { timeout: 120_000 });
const context = cdp.contexts()[0];
let page = context.pages().find((candidate) => candidate.url().includes('/dev/pipeline'));
if (!page) {
	page = await context.newPage();
	await page.goto('http://localhost:5173/dev/pipeline', { waitUntil: 'domcontentloaded' });
}
// A ranking change is a source change: reload so the page runs it, and do it
// before filling the textarea so the value is not discarded.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('textarea[aria-label="Private document benchmark JSON"]');
// The library loads asynchronously after the reload, and the gate resolves its
// document by name at click time: clicking too early fails with "Ready document
// not found" for a document that is present and indexed.
await page.waitForFunction(
	async (name) => {
		const { documentsStore } = await import('/src/lib/state/documents.svelte.ts');
		await documentsStore.init();
		return documentsStore.documents.some(
			(document) => document.name === name && document.status === 'ready'
		);
	},
	JSON.parse(matrix).documentName,
	{ timeout: 120_000 }
);

await page.locator('textarea[aria-label="Private document benchmark JSON"]').fill(matrix);
await page.getByRole('button', { name: 'Run fast retrieval gate' }).click();
console.error(`retrieval gate started on ${total} cases`);

const report = page.locator('[data-testid="private-document-benchmark-report"]');
const startedAt = Date.now();
for (;;) {
	await page.waitForTimeout(5000);
	if (await report.count()) {
		const parsed = JSON.parse(await report.textContent());
		if (parsed.error) throw new Error(`gate failed: ${parsed.error}`);
		// The report only renders once the run has finished, so its presence with
		// a full result set is the completion signal.
		if ((parsed.results?.length ?? 0) >= total) {
			console.error(
				`done in ${Math.round((Date.now() - startedAt) / 1000)}s — ` +
					`retrieval ${parsed.passed}/${parsed.total}, page recall ${parsed.pageRecallPassed}/${parsed.total}`
			);
			console.log(JSON.stringify(parsed.results));
			break;
		}
	}
	if (Date.now() - startedAt > 30 * 60_000) throw new Error('retrieval gate timed out');
	console.error(`waiting ${Math.round((Date.now() - startedAt) / 1000)}s`);
}
await cdp.close();
