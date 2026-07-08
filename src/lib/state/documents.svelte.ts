// Ingest orchestration + reactive document state (Svelte 5 runes module).
// Flow: hash → dedup check → store original in OPFS → parse (main thread;
// pdf.js uses its own worker) → chunk (pure, fast) → embed (worker) → insert.
// Every phase updates a named state the UI can render — no lying spinners.

import { wrap, proxy, type Remote } from 'comlink';
import { getLocalDb } from '$lib/local-db/client';
import type { DbInfo } from '$lib/local-db/worker';
import { sha256Hex } from '$lib/pipeline/hash';
import { chunkBlocks } from '$lib/pipeline/chunk';
import { parseText } from '$lib/pipeline/parse/text';
import type { EmbedApi } from '$lib/pipeline/embed-worker';
import { EMBEDDING_MODEL, type EmbedProgress } from '$lib/pipeline/embed-model';
import type {
	IngestErrorCode,
	LibraryDocument,
	LocalDocument,
	ParsedDoc,
	SearchHit
} from '$lib/types';

let embedApi: Remote<EmbedApi> | null = null;
function getEmbedWorker(): Remote<EmbedApi> {
	if (!embedApi) {
		const worker = new Worker(new URL('../pipeline/embed-worker.ts', import.meta.url), {
			type: 'module'
		});
		embedApi = wrap<EmbedApi>(worker);
	}
	return embedApi;
}

async function parseFile(file: File, data: ArrayBuffer): Promise<ParsedDoc> {
	const name = file.name.toLowerCase();
	if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
		const { parsePdf } = await import('$lib/pipeline/parse/pdf');
		return parsePdf(data);
	}
	if (name.endsWith('.docx')) {
		const { parseDocx } = await import('$lib/pipeline/parse/docx');
		return parseDocx(data);
	}
	if (name.endsWith('.md') || name.endsWith('.markdown')) {
		return parseText(new TextDecoder().decode(data), true);
	}
	if (name.endsWith('.txt') || file.type.startsWith('text/')) {
		return parseText(new TextDecoder().decode(data), false);
	}
	throw Object.assign(new Error(`Unsupported format: ${file.name}`), {
		code: 'unsupported_format' as const
	});
}

async function storeOriginal(hash: string, data: ArrayBuffer): Promise<void> {
	// Safari has no createWritable on the main thread; non-fatal for milestone 0
	// (the original file is only needed for the citation viewer, spec 003).
	try {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle('documents', { create: true });
		const fh = await dir.getFileHandle(hash, { create: true });
		const w = await fh.createWritable();
		await w.write(data);
		await w.close();
	} catch (err) {
		console.warn('[folio] could not persist original file to OPFS:', err);
	}
}

export interface IngestState {
	status: LocalDocument['status'];
	phaseProgress: number;
	error?: IngestErrorCode;
	dedup?: boolean;
}

class DocumentsStore {
	documents = $state<LocalDocument[]>([]);
	library = $state<LibraryDocument[]>([]);
	ingests = $state<Record<string, IngestState>>({});
	dbInfo = $state<DbInfo | null>(null);
	dbError = $state<string | null>(null);
	searching = $state(false);
	results = $state<SearchHit[]>([]);
	lastSearchMs = $state<number | null>(null);

	async init(): Promise<void> {
		try {
			const { db, info } = await getLocalDb();
			this.dbInfo = info;
			this.documents = await db.listDocuments();
			this.library = await db.listLibrary();
		} catch (err) {
			this.dbError = err instanceof Error ? err.message : String(err);
		}
	}

	async refreshLibrary(): Promise<void> {
		const { db } = await getLocalDb();
		this.documents = await db.listDocuments();
		this.library = await db.listLibrary();
	}

	private setIngest(id: string, state: IngestState): void {
		this.ingests = { ...this.ingests, [id]: state };
	}

	/** Ingest a file; returns the document id (existing one on dedup). */
	async ingest(file: File): Promise<string> {
		const { db } = await getLocalDb();
		const data = await file.arrayBuffer();
		const hash = await sha256Hex(data);

		const existing = await db.getDocumentByHash(hash);
		if (existing) {
			this.setIngest(existing.id, { status: existing.status, phaseProgress: 1, dedup: true });
			await this.refreshLibrary();
			return existing.id;
		}

		const id = crypto.randomUUID();
		await db.insertDocument({ id, hash, name: file.name, mime: file.type, size: file.size });
		this.setIngest(id, { status: 'received', phaseProgress: 0 });
		this.documents = await db.listDocuments();

		try {
			await storeOriginal(hash, data);

			this.setIngest(id, { status: 'parsing', phaseProgress: 0 });
			await db.setDocumentStatus(id, 'parsing');
			const parsed = await parseFile(file, data);

			this.setIngest(id, { status: 'chunking', phaseProgress: 0 });
			await db.setDocumentStatus(id, 'chunking', { pages: parsed.pages ?? undefined });
			const chunks = chunkBlocks(parsed.blocks);
			if (!chunks.length) {
				throw Object.assign(new Error('No usable text'), { code: 'parse_failed' as const });
			}

			this.setIngest(id, { status: 'embedding', phaseProgress: 0 });
			await db.setDocumentStatus(id, 'embedding');
			const { data: vectors, dims } = await getEmbedWorker().embed(
				chunks.map((c) => c.text),
				'passage',
				proxy((p: EmbedProgress) => {
					this.setIngest(id, {
						status: 'embedding',
						phaseProgress: p.phase === 'embed' ? p.progress : p.progress * 0.5
					});
				})
			);

			await db.insertChunks(id, chunks, vectors, dims);
			await db.setDocumentStatus(id, 'ready', { embeddingModel: EMBEDDING_MODEL });
			this.setIngest(id, { status: 'ready', phaseProgress: 1 });
		} catch (err) {
			const code: IngestErrorCode = (err as { code?: IngestErrorCode }).code ?? 'unknown';
			await db.setDocumentStatus(id, 'error', { error: code });
			this.setIngest(id, { status: 'error', phaseProgress: 0, error: code });
			if (code === 'unknown') console.error('[folio] ingest failed:', err);
		} finally {
			await this.refreshLibrary();
		}
		return id;
	}

	/** Hybrid retrieval over the given documents; returns the hits. */
	async retrieve(query: string, documentIds: string[] | null = null): Promise<SearchHit[]> {
		const { db } = await getLocalDb();
		const { data } = await getEmbedWorker().embed([query.trim()], 'query');
		return db.search(data, query.trim(), documentIds);
	}

	async search(query: string, documentIds: string[] | null = null): Promise<void> {
		const q = query.trim();
		if (!q) return;
		this.searching = true;
		try {
			const t0 = performance.now();
			this.results = await this.retrieve(q, documentIds);
			this.lastSearchMs = Math.round(performance.now() - t0);
		} finally {
			this.searching = false;
		}
	}

	async remove(id: string): Promise<void> {
		const { db } = await getLocalDb();
		await db.deleteDocument(id);
		await this.refreshLibrary();
	}
}

export const documentsStore = new DocumentsStore();
