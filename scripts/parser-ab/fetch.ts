// Download and verify the parser A/B evaluation corpus.
//
// Same contract as scripts/fetch-fuzzy-benchmark.ts: the manifest and its
// hashes are committed, the documents are not. Re-running is idempotent — a
// file already on disk with the right size and digest is left alone.

import manifest from '../../benchmarks/parser-ab-manifest.json';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';

const MAX_FILE_BYTES = 48 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(
	manifest.files.flatMap((entry) => [
		new URL(entry.url).hostname,
		...('htmlTwin' in entry && entry.htmlTwin ? [new URL(entry.htmlTwin.url).hostname] : [])
	])
);

const root = resolve(import.meta.dir, '../..');
const output = resolve(root, manifest.outputDirectory);

function digest(bytes: Uint8Array): string {
	const hash = new Bun.CryptoHasher('sha256');
	hash.update(bytes);
	return hash.digest('hex');
}

interface Target {
	name: string;
	url: string;
	bytes: number;
	sha256: string;
	format: 'pdf' | 'html';
}

async function verifyType(target: Target, bytes: Uint8Array): Promise<void> {
	if (target.format !== 'pdf') return;
	const detected = await fileTypeFromBuffer(bytes);
	if (detected?.mime !== 'application/pdf')
		throw new Error(`Signature mismatch: ${target.name} is ${detected?.mime ?? 'unknown'}`);
}

async function ensure(target: Target): Promise<void> {
	const url = new URL(target.url);
	if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname))
		throw new Error(`Refusing non-allowlisted benchmark URL: ${target.url}`);
	if (target.bytes > MAX_FILE_BYTES) throw new Error(`Manifest size cap exceeded: ${target.name}`);

	const path = resolve(output, target.name);
	if (!path.startsWith(`${output}/`)) throw new Error(`Unsafe benchmark path: ${target.name}`);

	const existing = Bun.file(path);
	if (await existing.exists()) {
		const bytes = new Uint8Array(await existing.arrayBuffer());
		if (bytes.byteLength === target.bytes && digest(bytes) === target.sha256) {
			await verifyType(target, bytes);
			console.log(`verified ${target.name}`);
			return;
		}
	}

	const response = await fetch(url, {
		headers: { 'user-agent': 'Regeste parser evaluation research contact@example.invalid' }
	});
	if (!response.ok) throw new Error(`Fetch failed (${response.status}): ${target.url}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`Download too large: ${target.name}`);

	const actual = digest(bytes);
	if (bytes.byteLength !== target.bytes || actual !== target.sha256) {
		// A publisher reissuing a brochure is normal and must not silently change
		// the corpus under the ground truth: fail loudly with the new digest so a
		// human decides whether to re-verify the labels and update the manifest.
		throw new Error(
			`Digest mismatch for ${target.name}.\n` +
				`  expected ${target.bytes} bytes ${target.sha256}\n` +
				`  received ${bytes.byteLength} bytes ${actual}\n` +
				`  The source document changed. Re-check the ground truth in ` +
				`scripts/parser-ab/truth.json before updating the manifest.`
		);
	}
	await verifyType(target, bytes);
	await Bun.write(path, bytes);
	console.log(`fetched  ${target.name}`);
}

await mkdir(output, { recursive: true });
const targets: Target[] = manifest.files.flatMap((entry) => [
	{
		name: entry.name,
		url: entry.url,
		bytes: entry.bytes,
		sha256: entry.sha256,
		format: 'pdf' as const
	},
	...('htmlTwin' in entry && entry.htmlTwin
		? [
				{
					name: entry.htmlTwin.name,
					url: entry.htmlTwin.url,
					bytes: entry.htmlTwin.bytes,
					sha256: entry.htmlTwin.sha256,
					format: 'html' as const
				}
			]
		: [])
]);

let failed = 0;
for (const target of targets) {
	try {
		await ensure(target);
	} catch (error) {
		failed++;
		console.error(`FAILED   ${target.name}: ${(error as Error).message}`);
	}
}
console.log(`\n${targets.length - failed}/${targets.length} corpus files ready in ${output}`);
if (failed) process.exit(1);
