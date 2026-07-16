import publicManifest from '../../../benchmarks/fuzzy-corpus-manifest.json';

export interface BenchmarkAsset {
	name: string;
	sha256: string;
	bytes: number;
	format: 'pdf' | 'txt' | 'docx';
	expectedPages?: { min: number; max: number };
	expectedChunks?: { min: number; max: number };
}

const CONTROLLED: readonly BenchmarkAsset[] = [
	{
		name: 'malik-profile-study.docx',
		format: 'docx',
		bytes: 37092,
		sha256: '678cc2ae118345af289f6c4d1cd92afaf8ef946852c0963dc1de9a131e686a17'
	},
	{
		name: 'malik-profile-family.docx',
		format: 'docx',
		bytes: 37085,
		sha256: '587f75a88bc6f328616aafb0d5756ae410e8376580c22ab9c02c504740e8e93c'
	},
	{
		name: 'near-identifiers-table.docx',
		format: 'docx',
		bytes: 37209,
		sha256: 'c9d2585b8b64a439f5af6b0674fa2dfb6c9517db1c2b70b5211f8a2632e3997e'
	},
	{
		name: 'malik-profile-note.txt',
		format: 'txt',
		bytes: 71,
		sha256: '04f120fd166bd5c983711c1b8e34ff8188187de44a4365784528d3ebb1d5073e'
	},
	{
		name: 'http-semantics.md',
		format: 'txt',
		bytes: 139,
		sha256: 'bcf5b72a884f95812a0d98b4225af88ba194daab1dcd465f77f0b9b8f460f1e7'
	},
	{
		name: 'tatqa-contract-sales.md',
		format: 'txt',
		bytes: 778,
		sha256: 'd210a301fa6744a7fb3c4ed3515ae71df7530f0326ade08fa63bf896a0d4a67b'
	},
	{
		name: 'finqa-payment-networks.txt',
		format: 'txt',
		bytes: 629,
		sha256: '7f0ad19af09371799c6f331c13f49b3e414afe05914c743d08b689e2a5c89eb3'
	}
] as const;

const PUBLIC = publicManifest.files
	.filter((entry) => entry.format === 'pdf' || entry.format === 'txt')
	.map((entry): BenchmarkAsset => ({
		name: entry.name,
		format: entry.format as 'pdf' | 'txt',
		bytes: entry.bytes,
		sha256: entry.sha256,
		...('expectedPages' in entry ? { expectedPages: entry.expectedPages } : {}),
		...('expectedChunks' in entry ? { expectedChunks: entry.expectedChunks } : {})
	}));

const FUZZY_BENCHMARK_ASSETS: readonly BenchmarkAsset[] = [...CONTROLLED, ...PUBLIC];

function hex(bytes: ArrayBuffer): string {
	return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function validateBenchmarkBytes(
	asset: BenchmarkAsset,
	data: ArrayBuffer
): Promise<void> {
	const bytes = new Uint8Array(data);
	if (bytes.byteLength !== asset.bytes) throw new Error(`Size mismatch: ${asset.name}`);
	if (asset.format === 'pdf' && new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-')
		throw new Error(`Signature mismatch: ${asset.name}`);
	if (asset.format === 'docx' && !(bytes[0] === 0x50 && bytes[1] === 0x4b))
		throw new Error(`Signature mismatch: ${asset.name}`);
	if (asset.format === 'txt' && bytes.includes(0))
		throw new Error(`Signature mismatch: ${asset.name}`);
	const digest = hex(await crypto.subtle.digest('SHA-256', data));
	if (digest !== asset.sha256) throw new Error(`Hash mismatch: ${asset.name}`);
}

export function assertBenchmarkBounds(
	asset: BenchmarkAsset,
	observed: { pages: number | null; chunks: number }
): void {
	if (
		asset.expectedPages &&
		(observed.pages === null ||
			observed.pages < asset.expectedPages.min ||
			observed.pages > asset.expectedPages.max)
	)
		throw new Error(`Page bound mismatch: ${asset.name}`);
	if (
		asset.expectedChunks &&
		(observed.chunks < asset.expectedChunks.min || observed.chunks > asset.expectedChunks.max)
	)
		throw new Error(`Chunk bound mismatch: ${asset.name}`);
}

export function benchmarkAsset(name: string): BenchmarkAsset {
	const asset = FUZZY_BENCHMARK_ASSETS.find((item) => item.name === name);
	if (!asset) throw new Error(`Unregistered benchmark asset: ${name}`);
	return asset;
}
