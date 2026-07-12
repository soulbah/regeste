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
import {
	expandRetrievalQuery,
	refineCandidates,
	selectWithNeighbors
} from '$lib/pipeline/retrieval';
import { RETRIEVAL_VERSION } from '$lib/pipeline/retrieval-version';
import type { MoneyKind } from '$lib/analysis/money';
import { extractFinancialRecords } from '$lib/analysis/financial-records';
import {
	aggregateMoneyFacts,
	FACT_EXTRACTOR_VERSION,
	type AggregateResult
} from '$lib/analysis/aggregate';
import type { IngestErrorCode, LibraryDocument, LocalDocument, SearchHit } from '$lib/types';

let embedApi: Remote<EmbedApi> | null = null;
const OCR_INDEX_VERSION = 2;
const OCR_INDEX_VERSION_KEY = 'folio:ocr-index-version';
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
	/** OCR pass abort controllers, keyed by document id (spec 023). */
	ocrAborts = $state<Record<string, AbortController>>({});
	/** Serializes auto-OCR passes so adding several scanned PDFs at once doesn't
	 *  run multiple main-thread reads concurrently and jank the UI. */
	private ocrChain: Promise<unknown> = Promise.resolve();
	private ocrRepairStarted = false;
	private interruptedRepairStarted = false;
	private retrievalRepairStarted = false;
	private processingIds = new Set<string>();
	dbInfo = $state<DbInfo | null>(null);
	dbError = $state<string | null>(null);
	/** False until the first library load lands, so the UI can tell "loading"
	 * apart from "genuinely empty" (no empty-state flash on refresh). */
	libraryLoaded = $state(false);
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
			void this.repairInterruptedIngests()
				.then(() => this.repairOcrIndexes())
				.then(() => this.repairRetrievalIndexes());
		} catch (err) {
			this.dbError = err instanceof Error ? err.message : String(err);
		} finally {
			// The library list must stop showing skeletons once the first load
			// settles, even if the database failed to open — an unresolved load
			// would otherwise hang the page on skeletons forever.
			this.libraryLoaded = true;
		}
	}

	/** Rebuild deterministic retrieval views from the local original. The DB
	 * version flips only inside the same transaction that swaps every index. */
	private async repairRetrievalIndexes(): Promise<void> {
		if (this.retrievalRepairStarted) return;
		this.retrievalRepairStarted = true;
		try {
			const { db } = await getLocalDb();
			for (const doc of this.documents.filter((item) => item.status === 'ready')) {
				if (this.processingIds.has(doc.id) || this.ocrAborts[doc.id]) continue;
				const chunkCount = await db.countChunks(doc.id);
				if ((doc.retrievalVersion ?? 1) >= RETRIEVAL_VERSION && chunkCount > 0) continue;
				await this.reindex(doc.id);
			}
		} finally {
			this.retrievalRepairStarted = false;
			await this.refreshLibrary();
		}
	}

	/** Resume rows whose async browser work was cut by a reload/crash. Bytes
	 * already persisted in OPFS are enough; embeddings/facts are rebuilt. */
	private async repairInterruptedIngests(): Promise<void> {
		if (this.interruptedRepairStarted) return;
		this.interruptedRepairStarted = true;
		try {
			const { db } = await getLocalDb();
			const interrupted = new Set<LocalDocument['status']>([
				'received',
				'parsing',
				'chunking',
				'embedding',
				'scanned',
				'ocr'
			]);
			for (const doc of this.documents.filter((item) => interrupted.has(item.status))) {
				if (this.processingIds.has(doc.id) || this.ocrAborts[doc.id]) continue;
				const data = await readOriginal(doc.hash);
				if (!data) {
					await db.setDocumentStatus(doc.id, 'error', { error: 'parse_failed' });
					this.setIngest(doc.id, { status: 'error', phaseProgress: 0, error: 'parse_failed' });
					continue;
				}
				await db.deleteChunks(doc.id);
				await this.processDocument(
					doc.id,
					new File([data], doc.name, { type: doc.mime }),
					doc.hash
				);
			}
		} finally {
			this.interruptedRepairStarted = false;
			await this.refreshLibrary();
		}
	}

	/** One-time repair for scanned PDFs indexed before per-page OCR cache bypass. */
	private async repairOcrIndexes(): Promise<void> {
		if (
			this.ocrRepairStarted ||
			Number(localStorage.getItem(OCR_INDEX_VERSION_KEY) ?? 0) >= OCR_INDEX_VERSION
		)
			return;
		this.ocrRepairStarted = true;
		try {
			const { db } = await getLocalDb();
			for (const doc of this.documents.filter(
				(item) => item.status === 'ready' && item.mime === 'application/pdf'
			)) {
				const data = await readOriginal(doc.hash);
				if (!data) continue;
				const parsed = await parseByName(doc.name, doc.mime, data);
				if (!parsed.needsOcr?.length) continue;
				await db.setDocumentStatus(doc.id, 'scanned');
				this.setIngest(doc.id, { status: 'scanned', phaseProgress: 0 });
				await this.ocrDocument(doc.id);
			}
			localStorage.setItem(OCR_INDEX_VERSION_KEY, String(OCR_INDEX_VERSION));
		} finally {
			this.ocrRepairStarted = false;
			await this.refreshLibrary();
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
		this.libraryLoaded = true;
	}

	needsReindex(id: string): boolean {
		return this.staleDocumentIds.has(id);
	}

	private setIngest(id: string, state: IngestState): void {
		this.ingests = { ...this.ingests, [id]: state };
	}

	/** Ingest a file; returns the document id (existing one on dedup). */
	async ingest(file: File): Promise<string> {
		const staged = await this.stageDocument(file);
		await this.refreshLibrary();
		if (staged.isNew) await this.processDocument(staged.id, file, staged.hash);
		return staged.id;
	}

	/**
	 * Ingest several files at once. Every row is inserted first so the whole
	 * selection shows immediately, in-progress, then the files are processed in
	 * the background with limited concurrency — instead of trickling in one at a
	 * time as each finishes. Returns the ids (existing ones on dedup) right after
	 * staging, so a caller can attach them without waiting for indexing.
	 */
	async ingestMany(files: File[]): Promise<string[]> {
		const staged: { id: string; hash: string; isNew: boolean; file: File }[] = [];
		for (const file of files) {
			staged.push({ ...(await this.stageDocument(file)), file });
		}
		await this.refreshLibrary();
		void this.processMany(staged.filter((s) => s.isNew));
		return staged.map((s) => s.id);
	}

	/** Hash + dedup + insert a pending row. Returns the id and whether it is new
	 *  (an existing hash is a no-op to process). The bytes are re-read at process
	 *  time so a large batch never holds every file in memory at once. */
	private async stageDocument(file: File): Promise<{ id: string; hash: string; isNew: boolean }> {
		const { db } = await getLocalDb();
		const hash = await sha256Hex(await file.arrayBuffer());
		const existing = await db.getDocumentByHash(hash);
		if (existing) {
			if (
				existing.status !== 'ready' &&
				!this.processingIds.has(existing.id) &&
				!this.ocrAborts[existing.id]
			) {
				await db.deleteChunks(existing.id);
				await db.setDocumentStatus(existing.id, 'received');
				this.setIngest(existing.id, { status: 'received', phaseProgress: 0 });
				return { id: existing.id, hash, isNew: true };
			}
			this.setIngest(existing.id, { status: existing.status, phaseProgress: 1, dedup: true });
			return { id: existing.id, hash, isNew: false };
		}
		const id = crypto.randomUUID();
		await db.insertDocument({ id, hash, name: file.name, mime: file.type, size: file.size });
		this.setIngest(id, { status: 'received', phaseProgress: 0 });
		return { id, hash, isNew: true };
	}

	/** Process staged files with limited concurrency. The single embed worker
	 *  serializes the heavy step, so this mostly overlaps parsing with embedding
	 *  rather than truly running everything at once — which would thrash. */
	private async processMany(staged: { id: string; hash: string; file: File }[]): Promise<void> {
		const CONCURRENCY = 3;
		let next = 0;
		const worker = async () => {
			while (next < staged.length) {
				const s = staged[next++];
				await this.processDocument(s.id, s.file, s.hash);
			}
		};
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, staged.length) }, worker));
	}

	/** Parse → chunk → embed → index one staged document (bytes re-read here). */
	private async processDocument(id: string, file: File, hash: string): Promise<void> {
		if (this.processingIds.has(id)) return;
		this.processingIds.add(id);
		const { db } = await getLocalDb();
		try {
			const data = await file.arrayBuffer();
			await storeOriginal(hash, data);

			this.setIngest(id, { status: 'parsing', phaseProgress: 0 });
			await db.setDocumentStatus(id, 'parsing');
			const parsed = await parseByName(file.name, file.type, data);
			const needsOcr = parsed.needsOcr ?? [];

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
			// Genuinely empty (no text AND no image page to OCR) is the only hard fail.
			if (!chunks.length && !needsOcr.length) {
				throw Object.assign(new Error('No usable text'), { code: 'parse_failed' as const });
			}

			let embeddingModel: string | undefined;
			if (chunks.length) {
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
				embeddingModel = model;
			}

			if (needsOcr.length) {
				// Image-only pages remain: land in `scanned` (text pages, if any,
				// already searchable), then read them on-device right away — a PDF
				// the user just added is expected to become searchable on its own,
				// not to wait for a click. Background + internally cancellable.
				await db.setDocumentStatus(id, 'scanned', {
					embeddingModel
				});
				this.setIngest(id, { status: 'scanned', phaseProgress: 1 });
				this.ocrChain = this.ocrChain.catch(() => {}).then(() => this.ocrDocument(id));
			} else {
				await db.setDocumentStatus(id, 'ready', { embeddingModel });
				this.setIngest(id, { status: 'ready', phaseProgress: 1 });
			}
		} catch (err) {
			const code: IngestErrorCode = (err as { code?: IngestErrorCode }).code ?? 'unknown';
			await db.setDocumentStatus(id, 'error', { error: code });
			this.setIngest(id, { status: 'error', phaseProgress: 0, error: code });
			if (code === 'unknown') console.error('[folio] ingest failed:', err);
		} finally {
			this.processingIds.delete(id);
			await this.refreshLibrary();
		}
	}

	/** Hybrid retrieval over the given documents; returns the hits. */
	async retrieve(
		query: string,
		documentIds: string[] | null = null,
		refinementQuery = query,
		onInspect?: () => void
	): Promise<SearchHit[]> {
		const { db } = await getLocalDb();
		const embeddingQuery = query.trim();
		const clean = expandRetrievalQuery(embeddingQuery);
		const refinedQuery = expandRetrievalQuery(refinementQuery.trim());
		const lexicalPromise = db.searchLexical(clean, documentIds, 60);
		const fuzzyPromise = db.searchFuzzy(clean, documentIds, 60);
		const { data, dims } = await getEmbedWorker().embed([embeddingQuery], 'query');
		const [lexical, fuzzy, semantic] = await Promise.all([
			lexicalPromise,
			fuzzyPromise,
			db.searchVector(data, dims, documentIds, 60)
		]);
		onInspect?.();
		const ranked = refineCandidates(semantic, lexical, refinedQuery, 24, fuzzy);
		const neighbors = await db.listNeighborChunks(
			ranked.slice(0, 12).map((hit) => hit.chunkId),
			1
		);
		return selectWithNeighbors(ranked, neighbors, refinedQuery, 8);
	}

	/** Dev benchmark ablation: same candidates, isolated by retrieval channel. */
	async retrieveChannelCandidates(
		query: string,
		documentIds: string[] | null = null
	): Promise<Record<'lexical' | 'fuzzy' | 'dense', SearchHit[]>> {
		const { db } = await getLocalDb();
		const embeddingQuery = query.trim();
		const expanded = expandRetrievalQuery(embeddingQuery);
		const lexicalPromise = db.searchLexical(expanded, documentIds, 60);
		const fuzzyPromise = db.searchFuzzy(expanded, documentIds, 60);
		const { data, dims } = await getEmbedWorker().embed([embeddingQuery], 'query');
		const [lexical, fuzzy, dense] = await Promise.all([
			lexicalPromise,
			fuzzyPromise,
			db.searchVector(data, dims, documentIds, 60)
		]);
		return {
			lexical: refineCandidates([], lexical, expanded, 10),
			fuzzy: refineCandidates([], [], expanded, 10, fuzzy),
			dense: refineCandidates(dense, [], expanded, 10)
		};
	}

	/** Exhaustive local path for numerical questions: no top-k truncation. */
	async aggregate(query: string, documentIds: string[]): Promise<AggregateResult> {
		const { db } = await getLocalDb();
		const cached = new Set(await db.listDocumentFactRunIds(documentIds, FACT_EXTRACTOR_VERSION));
		for (const documentId of documentIds.filter((id) => !cached.has(id))) {
			const chunks = await db.listChunksForDocuments([documentId]);
			const facts = extractFinancialRecords(chunks).flatMap((record) =>
				record.facts.map((fact) => ({
					kind: fact.kind,
					label: fact.label,
					valueMinor: fact.valueMinor,
					currency: fact.currency,
					confidence: fact.confidence,
					chunkId: fact.chunkId,
					recordKey: fact.recordKey,
					recordDate: fact.recordDate,
					recordId: fact.recordId
				}))
			);
			await db.replaceDocumentFacts(documentId, FACT_EXTRACTOR_VERSION, facts);
		}
		const facts = await db.listMoneyFacts(documentIds, FACT_EXTRACTOR_VERSION);
		return aggregateMoneyFacts(
			query,
			facts
				.filter((fact) => fact.chunkId !== null)
				.map((fact) => ({
					...fact,
					chunkId: fact.chunkId!,
					kind: fact.kind as MoneyKind,
					raw: undefined
				}))
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
		if (this.processingIds.has(id) || this.ocrAborts[id]) return;
		this.processingIds.add(id);
		const { db } = await getLocalDb();
		const doc = await db.getDocument(id);
		if (!doc) {
			this.processingIds.delete(id);
			return;
		}
		const existingChunkCount = await db.countChunks(id);
		const data = await readOriginal(doc.hash);
		if (!data) {
			this.setIngest(id, { status: 'error', phaseProgress: 0, error: 'parse_failed' });
			if (existingChunkCount === 0) {
				await db.setDocumentStatus(id, 'error', { error: 'parse_failed' });
			}
			this.processingIds.delete(id);
			return;
		}
		try {
			this.setIngest(id, { status: 'parsing', phaseProgress: 0 });
			const parsed = await parseByName(doc.name, doc.mime, data);
			let blocks = parsed.blocks;
			const needsOcr = parsed.needsOcr ?? [];
			if (needsOcr.length) {
				this.setIngest(id, { status: 'ocr', phaseProgress: 0 });
				const { ocrPages } = await import('$lib/pipeline/ocr');
				const ocrBlocks = await ocrPages(data, needsOcr, (progress) => {
					this.setIngest(id, {
						status: 'ocr',
						phaseProgress: progress.total ? progress.done / progress.total : 0
					});
				});
				blocks = [...blocks, ...ocrBlocks].sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
			}
			this.setIngest(id, { status: 'chunking', phaseProgress: 0 });
			const chunks = chunkBlocks(blocks, doc.name);
			if (!chunks.length) {
				throw Object.assign(new Error('No usable text after OCR'), {
					code: 'scanned_pdf' as const
				});
			}
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
			if (existingChunkCount === 0) await db.setDocumentStatus(id, 'error', { error: code });
		} finally {
			this.processingIds.delete(id);
			await this.refreshLibrary();
		}
	}

	/**
	 * Spec 023 — automatic on-device OCR of a `scanned` document. Re-parses to find
	 * the image-only pages, OCRs them on the main thread, splices the recognized
	 * text back at its page number, then re-chunks + re-embeds the merged document
	 * through the existing pipeline. Cancellable; nothing leaves the device.
	 */
	async ocrDocument(id: string): Promise<void> {
		// Already reading this document (auto-queue or a prior click): don't start
		// a second concurrent pass over the same pages.
		if (this.ocrAborts[id]) return;
		const { db } = await getLocalDb();
		const doc = await db.getDocument(id);
		if (!doc) return;
		const data = await readOriginal(doc.hash);
		if (!data) {
			await db.setDocumentStatus(id, 'error', { error: 'parse_failed' });
			this.setIngest(id, { status: 'error', phaseProgress: 0, error: 'parse_failed' });
			await this.refreshLibrary();
			return;
		}
		const controller = new AbortController();
		this.ocrAborts = { ...this.ocrAborts, [id]: controller };
		try {
			this.setIngest(id, { status: 'ocr', phaseProgress: 0 });
			await db.setDocumentStatus(id, 'ocr');
			const parsed = await parseByName(doc.name, doc.mime, data);
			const needsOcr = parsed.needsOcr ?? [];

			const { ocrPages } = await import('$lib/pipeline/ocr');
			// parseByName no longer detaches `data` (parsePdf slices), and ocrPages
			// slices again before its own getDocument, so reuse is safe.
			const ocrBlocks = await ocrPages(
				data,
				needsOcr,
				(p) =>
					this.setIngest(id, {
						status: 'ocr',
						phaseProgress: p.total ? p.done / p.total : 0
					}),
				controller.signal
			);

			// Merge OCR text pages with the extractable text pages, in page order,
			// so citations and the viewer resolve to the right location.
			const merged = [...parsed.blocks, ...ocrBlocks].sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
			this.setIngest(id, { status: 'chunking', phaseProgress: 0 });
			const chunks = chunkBlocks(merged, doc.name);
			if (!chunks.length) {
				// OCR read nothing usable — honest terminal, not a silent success.
				await db.setDocumentStatus(id, 'error', { error: 'scanned_pdf' });
				this.setIngest(id, { status: 'error', phaseProgress: 0, error: 'scanned_pdf' });
				return;
			}

			const language =
				detectLanguage(
					merged
						.slice(0, 12)
						.map((b) => b.text)
						.join(' ')
				) ?? undefined;
			// db status stays 'ocr' through embedding so the panel keeps showing the
			// pass; only the local ingest label switches to 'embedding'.
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
			await db.deleteChunks(id);
			await db.insertChunks(id, chunks, vectors, dims);
			await db.setDocumentStatus(id, 'ready', { embeddingModel: model, language });
			this.setIngest(id, { status: 'ready', phaseProgress: 1 });
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				// Cancelled: back to `scanned` — the text pages (if any) stay searchable.
				await db.setDocumentStatus(id, 'scanned');
				this.setIngest(id, { status: 'scanned', phaseProgress: 1 });
			} else {
				const code: IngestErrorCode = (err as { code?: IngestErrorCode }).code ?? 'unknown';
				await db.setDocumentStatus(id, 'error', { error: code });
				this.setIngest(id, { status: 'error', phaseProgress: 0, error: code });
				if (code === 'unknown') console.error('[folio] OCR failed:', err);
			}
		} finally {
			const rest = { ...this.ocrAborts };
			delete rest[id];
			this.ocrAborts = rest;
			await this.refreshLibrary();
		}
	}

	/** Cancel an in-flight OCR pass; the document reverts to `scanned`. */
	cancelOcr(id: string): void {
		this.ocrAborts[id]?.abort();
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
