// One-shot: connect over CDP, trigger spikeRun, wait for results, print JSON.
import { chromium } from 'playwright-core';

const N = Number(process.argv[2] ?? 128);
const browser = await chromium.connectOverCDP('http://localhost:9223');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().startsWith('http://localhost:5199'));
if (!page) {
	console.error('spike page not found; open http://localhost:5199 first');
	process.exit(1);
}
page.on('console', (m) => {
	const t = m.text();
	if (!t.startsWith('RESULTS')) console.log('[page]', t.slice(0, 300));
});
const results = await page.evaluate(async (n) => await window.spikeRun(n), N);
console.log('FINAL_RESULTS ' + JSON.stringify(results, null, 1));
await browser.close();
