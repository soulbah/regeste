// Ingest orchestration + reactive document state (Svelte 5 runes module).
// Flow: hash → dedup check → store original in OPFS → parse (main thread;
// pdf.js uses its own worker) → chunk (pure, fast) → embed (worker) → insert.
// Every phase updates a named state the UI can render — no lying spinners.

import { wrap, proxy, type Remote } from 'comlink';
import { getLocalDb } from '$lib/local-db/client';
import type { DbInfo } from '$lib/local-db/worker';
import { sha256Hex } from '$lib/pipeline/hash';
import { chunkBlocks } from '$lib/pipeline/chunk';
import { detectLanguage } from '$lib/pipeline/language';
import { parseByName } from '$lib/pipeline/parse';
import { readOriginal } from '$lib/opfs';
import type { EmbedApi } from '$lib/pipeline/embed-worker';
import {
	detectEmbeddingProfile,
	type EmbedProgress,
	type EmbeddingProfile
} from '$lib/pipeline/embed-model';
import { fuseCandidates } from '$lib/pipeline/retrieval';
import { extractMoneyCandidates } from '$lib/analysis/money';
import type { MoneyKind } from '$lib/analysis/money';
import {
	aggregateMoneyFacts,
	FACT_EXTRACTOR_VERSION,
	type AggregateResult
} from '$lib/analysis/aggregate';
import type { IngestErrorCode, LibraryDocument, LocalDocument, SearchHit } from '$lib/types';

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
	/** P3 — documentId → last time excerpts of it left the device. */
	egress = $state<Record<string, number>>({});
	ingests = $state<Record<string, IngestState>>({});
	dbInfo = $state<DbInfo | null>(null);
	dbError = $state<string | null>(null);
	searching = $state(false);
	results = $state<SearchHit[]>([]);
	lastSearchMs = $state<number | null>(null);
	embeddingProfile = $state<EmbeddingProfile | null>(null);
	staleDocumentIds = $state<Set<string>>(new Set());

	async init(): Promise<void> {
		try {
			const { info } = await getLocalDb();
			this.dbInfo = info;
			this.embeddingProfile = await detectEmbeddingProfile();
			await this.refreshLibrary();
		} catch (err) {
			this.dbError = err instanceof Error ? err.message : String(err);
		}
	}

	async refreshLibrary(): Promise<void> {
		const { db } = await getLocalDb();
		this.documents = await db.listDocuments();
		this.library = await db.listLibrary();
		const rows = await db.documentEgress();
		this.egress = Object.fromEntries(rows.map((r) => [r.documentId, r.lastSentAt]));
		this.staleDocumentIds = new Set(
			this.embeddingProfile
				? this.documents
						.filter(
							(doc) => doc.status === 'ready' && doc.embeddingModel !== this.embeddingProfile!.model
						)
						.map((doc) => doc.id)
				: []
		);
	}

	needsReindex(id: string): boolean {
		return this.staleDocumentIds.has(id);
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
			const parsed = await parseByName(file.name, file.type, data);

			this.setIngest(id, { status: 'chunking', phaseProgress: 0 });
			const language =
				detectLanguage(
					parsed.blocks
						.slice(0, 12)
						.map((b) => b.text)
						.join(' ')
				) ?? undefined;
			await db.setDocumentStatus(id, 'chunking', { pages: parsed.pages ?? undefined, language });
			const chunks = chunkBlocks(parsed.blocks, file.name);
			if (!chunks.length) {
				throw Object.assign(new Error('No usable text'), { code: 'parse_failed' as const });
			}

			this.setIngest(id, { status: 'embedding', phaseProgress: 0 });
			await db.setDocumentStatus(id, 'embedding');
			const {
				data: vectors,
				dims,
				model
			} = await getEmbedWorker().embed(
				chunks.map((c) => c.searchText),
				'passage',
				proxy((p: EmbedProgress) => {
					this.setIngest(id, {
						status: 'embedding',
						phaseProgress: p.phase === 'embed' ? p.progress : p.progress * 0.5
					});
				})
			);

			await db.insertChunks(id, chunks, vectors, dims);
			await db.setDocumentStatus(id, 'ready', { embeddingModel: model });
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
		const clean = query.trim();
		const lexicalPromise = db.searchLexical(clean, documentIds, 80);
		const { data, dims } = await getEmbedWorker().embed([clean], 'query');
		const [lexical, semantic] = await Promise.all([
			lexicalPromise,
			db.searchVector(data, dims, documentIds, 80)
		]);
		return fuseCandidates(semantic, lexical, 8);
	}

	/** Exhaustive local path for numerical questions: no top-k truncation. */
	async aggregate(query: string, documentIds: string[]): Promise<AggregateResult> {
		const { db } = await getLocalDb();
		const cached = new Set(await db.listDocumentFactRunIds(documentIds, FACT_EXTRACTOR_VERSION));
		for (const documentId of documentIds.filter((id) => !cached.has(id))) {
			const chunks = await db.listChunksForDocuments([documentId]);
			const facts = chunks.flatMap((chunk) =>
				extractMoneyCandidates(chunk.text).map((fact) => ({ ...fact, chunkId: chunk.chunkId }))
			);
			await db.replaceDocumentFacts(documentId, FACT_EXTRACTOR_VERSION, facts);
		}
		const facts = await db.listMoneyFacts(documentIds, FACT_EXTRACTOR_VERSION);
		return aggregateMoneyFacts(
			query,
			facts
				.filter((fact) => fact.chunkId !== null)
				.map((fact) => ({ ...fact, chunkId: fact.chunkId!, kind: fact.kind as MoneyKind }))
		);
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

	/** D4 — rebuild chunks + embeddings from the OPFS original. */
	async reindex(id: string): Promise<void> {
		const { db } = await getLocalDb();
		const doc = await db.getDocument(id);
		if (!doc) return;
		const data = await readOriginal(doc.hash);
		if (!data) {
			this.setIngest(id, { status: 'error', phaseProgress: 0, error: 'parse_failed' });
			return;
		}
		try {
			this.setIngest(id, { status: 'parsing', phaseProgress: 0 });
			const parsed = await parseByName(doc.name, doc.mime, data);
			this.setIngest(id, { status: 'chunking', phaseProgress: 0 });
			const chunks = chunkBlocks(parsed.blocks, doc.name);
			this.setIngest(id, { status: 'embedding', phaseProgress: 0 });
			const {
				data: vectors,
				dims,
				model
			} = await getEmbedWorker().embed(
				chunks.map((c) => c.searchText),
				'passage',
				proxy((p: EmbedProgress) => {
					this.setIngest(id, {
						status: 'embedding',
						phaseProgress: p.phase === 'embed' ? p.progress : p.progress * 0.5
					});
				})
			);
			await db.reindexDocument(id, chunks, vectors, dims, model);
			this.setIngest(id, { status: 'ready', phaseProgress: 1 });
		} catch (err) {
			const code: IngestErrorCode = (err as { code?: IngestErrorCode }).code ?? 'unknown';
			this.setIngest(id, { status: 'error', phaseProgress: 0, error: code });
		} finally {
			await this.refreshLibrary();
		}
	}

	/**
	 * PRD §5 — atomic version replacement: the new file is fully parsed and
	 * embedded while the old version stays live; the swap only happens on
	 * success. Returns an error code instead of touching anything on failure.
	 */
	async replace(id: string, file: File): Promise<IngestErrorCode | null> {
		const { db } = await getLocalDb();
		const data = await file.arrayBuffer();
		const hash = await sha256Hex(data);
		try {
			const parsed = await parseByName(file.name, file.type, data);
			const chunks = chunkBlocks(parsed.blocks, file.name);
			if (!chunks.length) {
				throw Object.assign(new Error('No usable text'), { code: 'parse_failed' as const });
			}
			const {
				data: vectors,
				dims,
				model
			} = await getEmbedWorker().embed(
				chunks.map((c) => c.searchText),
				'passage'
			);
			const language = detectLanguage(
				parsed.blocks
					.slice(0, 12)
					.map((b) => b.text)
					.join(' ')
			);
			await storeOriginal(hash, data);
			await db.replaceDocument(
				id,
				{ hash, name: file.name, mime: file.type, size: file.size, pages: parsed.pages },
				chunks,
				vectors,
				dims,
				language
			);
			await db.setDocumentStatus(id, 'ready', { embeddingModel: model });
			return null;
		} catch (err) {
			return (err as { code?: IngestErrorCode }).code ?? 'unknown';
		} finally {
			await this.refreshLibrary();
		}
	}
}

export const documentsStore = new DocumentsStore();
