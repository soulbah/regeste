// Launches (or reuses) the persistent benchmark Chromium and opens the spike page.
import { chromium } from 'playwright-core';

const PROFILE = '/Users/dev/Projects/saas/folio/.benchmark-corpus/chrome-profile';
const URL = 'http://localhost:5199/';

const ctx = await chromium.launchPersistentContext(PROFILE, {
	headless: false,
	viewport: { width: 1280, height: 900 },
	args: ['--remote-debugging-port=9223']
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(URL);
console.log('spike page open at', URL, '— CDP on 9223');
// Keep process alive; the browser stays up for one-shot CDP scripts.
await new Promise(() => {});
