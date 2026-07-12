import manifest from '../benchmarks/fuzzy-corpus-manifest.json';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const ALLOWED_HOSTS = new Set([
	'www.nasa.gov',
	'ntrs.nasa.gov',
	'www.govinfo.gov',
	'www.rfc-editor.org',
	'www.sec.gov'
]);
const root = resolve(import.meta.dir, '..');
const output = resolve(root, manifest.outputDirectory);

function digest(bytes: Uint8Array): string {
	const hash = new Bun.CryptoHasher('sha256');
	hash.update(bytes);
	return hash.digest('hex');
}

await mkdir(output, { recursive: true });
for (const entry of manifest.files) {
	const url = new URL(entry.url);
	if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
		throw new Error(`Refusing non-allowlisted benchmark URL: ${entry.url}`);
	}
	if (entry.bytes > MAX_FILE_BYTES) throw new Error(`Manifest size cap exceeded: ${entry.name}`);
	const path = resolve(output, entry.name);
	if (!path.startsWith(`${output}/`)) throw new Error(`Unsafe benchmark path: ${entry.name}`);
	const existing = Bun.file(path);
	if (await existing.exists()) {
		const bytes = new Uint8Array(await existing.arrayBuffer());
		if (bytes.byteLength === entry.bytes && digest(bytes) === entry.sha256) {
			console.log(`verified ${entry.name}`);
			continue;
		}
	}
	const response = await fetch(url, {
		headers: { 'user-agent': 'Folio retrieval benchmark research contact@example.invalid' },
		redirect: 'follow'
	});
	if (!response.ok) throw new Error(`Download failed ${response.status}: ${entry.url}`);
	const declared = Number(response.headers.get('content-length') ?? 0);
	if (declared > MAX_FILE_BYTES) throw new Error(`Remote size cap exceeded: ${entry.name}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength !== entry.bytes || digest(bytes) !== entry.sha256) {
		throw new Error(`Hash/size mismatch: ${entry.name}`);
	}
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, bytes);
	console.log(`downloaded ${entry.name}`);
}
