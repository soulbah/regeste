// Ingest a document into the benchmark browser profile through the product's
// own path, so a benchmark measures what a user would get rather than a
// fixture built beside the pipeline.
//
// Requires the persistent Chromium (CDP 9223) and a dev server on 5173.
//
// Usage: node scripts/bench-ingest.mjs <file.pdf> [more.pdf...]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright-core';

const paths = process.argv.slice(2);
if (!paths.length) {
	console.error('usage: node scripts/bench-ingest.mjs <file.pdf> [...]');
	process.exit(1);
}

const cdp = await chromium.connectOverCDP('http://localhost:9223');
const context = cdp.contexts()[0];
let page = context.pages().find((candidate) => candidate.url().includes('/dev/pipeline'));
if (!page) {
	page = await context.newPage();
	await page.goto('http://localhost:5173/dev/pipeline', { waitUntil: 'domcontentloaded' });
	await page.waitForLoadState('networkidle');
}

for (const path of paths) {
	const name = basename(path);
	const base64 = readFileSync(path).toString('base64');
	console.error(`ingesting ${name}…`);
	const outcome = await page.evaluate(
		async ({ name, base64 }) => {
			const { documentsStore } = await import('/src/lib/state/documents.svelte.ts');
			await documentsStore.init();
			const existing = documentsStore.documents.find((document) => document.name === name);
			if (existing?.status === 'ready') return { status: 'already-ready', pages: existing.pages };
			const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
			const file = new File([bytes], name, { type: 'application/pdf' });
			const id = await documentsStore.ingest(file);
			// Ingest resolves when the work is queued, not when the index is
			// usable; the benchmark needs the document actually searchable.
			for (let attempt = 0; attempt < 1800; attempt++) {
				await documentsStore.refreshLibrary();
				const current = documentsStore.documents.find((document) => document.id === id);
				if (current && ['ready', 'error', 'scanned'].includes(current.status)) {
					return { status: current.status, pages: current.pages, error: current.error };
				}
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
			return { status: 'timeout' };
		},
		{ name, base64 }
	);
	console.error(`  ${name}: ${JSON.stringify(outcome)}`);
}

const documents = await page.evaluate(async () => {
	const { documentsStore } = await import('/src/lib/state/documents.svelte.ts');
	await documentsStore.refreshLibrary();
	return documentsStore.documents.map((document) => ({
		name: document.name,
		status: document.status,
		pages: document.pages
	}));
});
console.log(JSON.stringify(documents, null, 1));
await cdp.close();
