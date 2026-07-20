// Cloudflare Workers refuses any static asset over 25 MiB, on every plan
// (https://developers.cloudflare.com/workers/platform/limits/#static-assets).
// onnxruntime-web's jsep build sits ~0.4% under that ceiling, so the next
// dependency bump would break `wrangler deploy` with nothing failing earlier.
// Fail the build instead, where the cause is obvious.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.svelte-kit/cloudflare';
const LIMIT = 25 * 1024 * 1024;
const WARN_AT = LIMIT * 0.9;

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [[path, statSync(path).size]];
	});
}

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
const oversized = [];
const close = [];

for (const [path, size] of walk(ROOT)) {
	if (size > LIMIT) oversized.push([path, size]);
	else if (size > WARN_AT) close.push([path, size]);
}

for (const [path, size] of close) {
	console.warn(`  ${mib(size)}  ${path} — within 10% of the 25 MiB asset limit`);
}
if (oversized.length) {
	console.error(
		`\n${oversized.length} asset(s) exceed Cloudflare's 25 MiB limit and cannot deploy:`
	);
	for (const [path, size] of oversized) console.error(`  ${mib(size)}  ${path}`);
	process.exit(1);
}
