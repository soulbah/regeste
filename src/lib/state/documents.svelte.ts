// Ingest orchestration + reactive document state (Svelte 5 runes module).
// Flow: hash → dedup check → store original in OPFS → parse (main thread;
// pdf.js uses its own worker) → chunk (pure, fast) → embed (worker) → insert.
// Every phase updates a named state the UI can render — no lying spinners.

import { wrap, proxy, type Remote } from 'comlink';
import { getLocalDb, type LocalDb } from '$lib/local-db/client';
import type { DbInfo } from '$lib/local-db/worker';
import { sha256Hex } from '$lib/pipeline/hash';
import { chunkBlocks } from '$lib/pipeline/chunk';
import { detectLanguage } from '$lib/pipeline/language';
import { parseWithLayout } from '$lib/pipeline/parse-with-layout';
import { mergeParsedWithOcr } from '$lib/pipeline/pdf-text-quality';
import { readOriginal } from '$lib/opfs';
import type { EmbedApi } from '$lib/pipeline/embed-worker';
import type { RerankApi } from '$lib/pipeline/rerank-worker';
import { RERANK_CANDIDATES, RERANK_KEEP, type RerankProgress } from '$lib/pipeline/rerank-model';
import type { RetrievalRankingApi } from '$lib/pipeline/retrieval-ranking-worker';
import type {
	FinalRankingInput,
	FusionRankingInput,
	FusionRankingOutput,
	InitialRankingInput,
	RankedChannels
} from '$lib/pipeline/retrieval-ranking';
import { embedPassagesInBatches, waitForBackgroundIdle } from '$lib/pipeline/embed-batches';
import {
	detectEmbeddingProfile,
	type EmbedProgress,
	type EmbeddingProfile
} from '$lib/pipeline/embed-model';
import {
	denseRetrievalQueryVariants,
	expandChannelCandidatesWithNeighbors,
	expandStructuralParents,
	mergeRankedCandidateLists,
	neighborsForAnchors,
	refineCandidates,
	isNumericAnswerQuestion,
	retrievalQueryVariants,
	selectWithNeighbors
} from '$lib/pipeline/retrieval';
import { evidenceText } from '$lib/pipeline/evidence-text';
import { RETRIEVAL_VERSION } from '$lib/pipeline/retrieval-version';
import { guardWorker } from '$lib/state/worker-health.svelte';
import { embeddingPhaseProgress } from '$lib/ingest-readiness';
import { QueryEmbeddingCache } from '$lib/pipeline/query-embedding-cache';
import type { MoneyKind } from '$lib/analysis/money';
import { analyzeQuestion } from '$lib/analysis/query-router';
import {
	extractFinancialRecords,
	extractScheduleRecords,
	type FinancialRecord
} from '$lib/analysis/financial-records';
import {
	aggregateMoneyFacts,
	FACT_EXTRACTOR_VERSION,
	type AggregateResult
} from '$lib/analysis/aggregate';
import { toast } from 'svelte-sonner';
import { t } from '$lib/i18n/index.svelte';
import type {
	IngestErrorCode,
	LibraryDocument,
	LocalDocument,
	QuestionRoute,
	SearchHit
} from '$lib/types';

let embedApi: Remote<EmbedApi> | null = null;
const rankingWorkers: Array<{
	worker: Worker;
	api: Remote<RetrievalRankingApi>;
}> = [];
const OCR_INDEX_VERSION = 2;
const OCR_INDEX_VERSION_KEY = 'regeste:ocr-index-version';
const RERANK_CONSENT_KEY = 'regeste:rerank-consent';
function getEmbedWorker(): Remote<EmbedApi> {
	if (!embedApi) {
		const worker = new Worker(new URL('../pipeline/embed-worker.ts', import.meta.url), {
			type: 'module'
		});
		guardWorker(worker, 'search');
		embedApi = wrap<EmbedApi>(worker);
	}
	return embedApi;
}

let rerankApi: Remote<RerankApi> | null = null;
function getRerankWorker(): Remote<RerankApi> {
	if (!rerankApi) {
		const worker = new Worker(new URL('../pipeline/rerank-worker.ts', import.meta.url), {
			type: 'module'
		});
		guardWorker(worker, 'search');
		rerankApi = wrap<RerankApi>(worker);
	}
	return rerankApi;
}

function rankingConcurrency(): number {
	return Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
}

function getRankingWorkers(count: number) {
	const desired = Math.min(Math.max(1, count), rankingConcurrency());
	while (rankingWorkers.length < desired) {
		const worker = new Worker(new URL('../pipeline/retrieval-ranking-worker.ts', import.meta.url), {
			type: 'module'
		});
		guardWorker(worker, 'search');
		rankingWorkers.push({ worker, api: wrap<RetrievalRankingApi>(worker) });
	}
	return rankingWorkers.slice(0, desired);
}

async function mapRankingWorkers<T, R>(
	inputs: T[],
	call: (api: Remote<RetrievalRankingApi>, input: T) => Promise<R>
): Promise<R[]> {
	if (!inputs.length) return [];
	const pool = getRankingWorkers(inputs.length);
	return Promise.all(inputs.map((input, index) => call(pool[index % pool.length].api, input)));
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
		console.warn('[regeste] could not persist original file to OPFS:', err);
		// Say it now, once. The consequence otherwise surfaces days later, when the
		// viewer shows "no longer available" for a document whose answers still
		// work, with nothing connecting that to this moment. Once per session:
		// every file in a batch fails the same way for the same reason.
		if (!originalNotKeptToldOnce) {
			originalNotKeptToldOnce = true;
			toast.warning(t('toast.originalNotKept'));
		}
	}
}

let originalNotKeptToldOnce = false;

export interface IngestState {
	status: LocalDocument['status'];
	phaseProgress: number;
	error?: IngestErrorCode;
	diagnostic?: string;
	dedup?: boolean;
}

export interface RetrievalRequest {
	query: string;
	documentIds?: string[] | null;
	refinementQuery?: string;
	onInspect?: () => void;
	route?: QuestionRoute;
	alternateQueries?: string[];
	onDiagnostic?: (diagnostic: RetrievalDiagnostic) => void;
}

export interface RetrievalDiagnostic {
	channels: Record<'semantic' | 'lexical' | 'fuzzy', RetrievalDiagnosticHit[]>;
	fused: RetrievalDiagnosticHit[];
	neighbors: RetrievalDiagnosticHit[];
	final: RetrievalDiagnosticHit[];
}

export interface RetrievalBatchTiming {
	requests: number;
	sparseVariants: number;
	denseVariants: number;
	embeddingMs: number;
	candidateSearchMs: number;
	preFusionNeighborsMs: number;
	channelNeighborsMs: number;
	initialRankingMs: number;
	fusionRankingMs: number;
	finalRankingMs: number;
	rankingWorkers: number;
	rankingMs: number;
	totalMs: number;
}

interface RetrievalDiagnosticHit {
	chunkId: number;
	page: number | null;
	score: number;
	text: string;
}

function diagnosticHit(hit: SearchHit): RetrievalDiagnosticHit {
	return { chunkId: hit.chunkId, page: hit.page, score: hit.score, text: hit.text.slice(0, 320) };
}

class DocumentsStore {
	private queryEmbeddings = new QueryEmbeddingCache();
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
	/** Reactive mirror of processingIds. `ingests` is a progress map that keeps
	 * its terminal entries, so its size answers "has ever ingested", not "is
	 * working right now" — anything gating on an idle app needs this instead. */
	ingesting = $state(0);
	dbInfo = $state<DbInfo | null>(null);
	dbError = $state<string | null>(null);
	/** False until the first library load lands, so the UI can tell "loading"
	 * apart from "genuinely empty" (no empty-state flash on refresh). */
	libraryLoaded = $state(false);
	searching = $state(false);
	results = $state<SearchHit[]>([]);
	lastSearchMs = $state<number | null>(null);
	embeddingProfile = $state<EmbeddingProfile | null>(null);
	/** Reranking is opt-in: it costs a 544 MB download, so nothing happens until
	 * the reader accepts it. `null` means never asked. */
	rerankAccepted = $state<boolean>(
		typeof localStorage !== 'undefined' && localStorage.getItem(RERANK_CONSENT_KEY) === 'yes'
	);
	rerankDownload = $state<RerankProgress | null>(null);
	rerankReady = $state(false);
	rerankError = $state<string | null>(null);
	/** A rebuild the reader did not ask for: the app changed how documents are
	 * indexed, so everything already stored has to be read again. Silent, it
	 * looks like nothing is happening while answers quietly improve; worse, a
	 * question asked mid-rebuild is answered from half-old passages with no hint
	 * why. Surfaced above the composer so the chat stays usable throughout. */
	reindexTotal = $state(0);
	reindexDone = $state(0);
	reindexNames = $state<string[]>([]);
	staleDocumentIds = $state<Set<string>>(new Set());

	/** Shared local query encoder for semantic routing and retrieval. */
	async embedQueries(
		texts: string[]
	): Promise<{ data: Float32Array; dims: number; model: string }> {
		return this.queryEmbeddings.embed(texts, async (missing) => {
			const { data, dims, model } = await getEmbedWorker().embed(missing, 'query');
			return { data, dims, model };
		});
	}

	private async embedPassages(texts: string[], onProgress?: (progress: EmbedProgress) => void) {
		return embedPassagesInBatches(
			texts,
			(batch, report) =>
				getEmbedWorker().embed(batch, 'passage', report ? proxy(report) : undefined),
			onProgress
		);
	}

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
			const stale: LocalDocument[] = [];
			for (const doc of this.documents.filter((item) => item.status === 'ready')) {
				if (this.processingIds.has(doc.id) || this.ocrAborts[doc.id]) continue;
				const chunkCount = await db.countChunks(doc.id);
				if ((doc.retrievalVersion ?? 1) >= RETRIEVAL_VERSION && chunkCount > 0) continue;
				stale.push(doc);
			}
			if (!stale.length) return;
			this.reindexTotal = stale.length;
			this.reindexDone = 0;
			this.reindexNames = [];
			// Two at a time. One document at a time left a five-document library
			// rebuilding for minutes with a bar that barely moved; the whole
			// library at once starves the query path, and a question asked during
			// the rebuild is the moment this matters most. The embed worker
			// already serves queries before passage batches, so two rebuilds keep
			// it busy without owning it.
			const queue = [...stale];
			const worker = async () => {
				for (;;) {
					const doc = queue.shift();
					if (!doc) return;
					this.reindexNames = [...this.reindexNames, doc.name];
					await waitForBackgroundIdle();
					await this.reindex(doc.id);
					this.reindexDone += 1;
					this.reindexNames = this.reindexNames.filter((name) => name !== doc.name);
				}
			};
			await Promise.all([worker(), worker()]);
		} finally {
			this.retrievalRepairStarted = false;
			this.reindexTotal = 0;
			this.reindexDone = 0;
			this.reindexNames = [];
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
				const parsed = await parseWithLayout(doc.name, doc.mime, data);
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

	private startProcessing(id: string): void {
		this.processingIds.add(id);
		this.ingesting = this.processingIds.size;
	}

	private endProcessing(id: string): void {
		this.processingIds.delete(id);
		this.ingesting = this.processingIds.size;
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
		this.startProcessing(id);
		const { db } = await getLocalDb();
		try {
			const data = await file.arrayBuffer();
			await storeOriginal(hash, data);

			this.setIngest(id, { status: 'parsing', phaseProgress: 0 });
			await db.setDocumentStatus(id, 'parsing');
			const parsed = await parseWithLayout(file.name, file.type, data);
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
				// Mixed PDFs get a searchable partial index before image pages are read.
				// That preliminary pass is internal: exposing Preparing here would make
				// the user-facing pipeline jump backwards to Reading when OCR starts.
				const visibleStatus = needsOcr.length ? 'parsing' : 'embedding';
				this.setIngest(id, { status: visibleStatus, phaseProgress: 0 });
				await db.setDocumentStatus(id, 'embedding');
				const {
					data: vectors,
					dims,
					model
				} = await this.embedPassages(
					chunks.map((c) => c.searchText),
					(p: EmbedProgress) => {
						this.setIngest(id, {
							status: visibleStatus,
							phaseProgress: needsOcr.length ? 0 : embeddingPhaseProgress(p.phase, p.progress)
						});
					}
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
			if (code === 'unknown') console.error('[regeste] ingest failed:', err);
		} finally {
			this.endProcessing(id);
			await this.refreshLibrary();
		}
	}

	/** Hybrid retrieval over the given documents; returns the hits. */
	async retrieve(
		query: string,
		documentIds: string[] | null = null,
		refinementQuery = query,
		onInspect?: () => void,
		route?: QuestionRoute,
		alternateQueries: string[] = []
	): Promise<SearchHit[]> {
		return (
			await this.retrieveMany([
				{ query, documentIds, refinementQuery, onInspect, route, alternateQueries }
			])
		)[0];
	}

	/** Batch hybrid retrieval. Query embeddings share one worker job; the worker
	 * still applies its safe internal batch size and serial model execution. */
	async retrieveMany(
		requests: RetrievalRequest[],
		onBatchTiming?: (timing: RetrievalBatchTiming) => void
	): Promise<SearchHit[][]> {
		if (!requests.length) return [];
		const totalStartedAt = performance.now();
		const { db } = await getLocalDb();
		const prepared = requests.map((request) => {
			const embeddingQuery = request.query.trim();
			const alternateQueries = request.alternateQueries ?? [];
			const evidenceQuery = request.refinementQuery?.trim() || embeddingQuery;
			return {
				...request,
				documentIds: request.documentIds ?? null,
				route: request.route ?? analyzeQuestion(evidenceQuery).route,
				sparseQueryVariants: [
					...retrievalQueryVariants(embeddingQuery),
					...alternateQueries.flatMap(retrievalQueryVariants)
				].filter((variant, index, all) => all.indexOf(variant) === index),
				denseQueryVariants: denseRetrievalQueryVariants(
					embeddingQuery,
					request.route,
					alternateQueries
				),
				// Recall variants may be deliberately broad, translated or typo-tolerant.
				// Evidence ranking must stay anchored to the user's actual information
				// need; otherwise expansion terms can promote an unrelated passage.
				evidenceQuery
			};
		});
		const flattenedSparse = prepared.flatMap((request, requestIndex) =>
			request.sparseQueryVariants.map((variant) => ({ requestIndex, variant }))
		);
		const flattenedDense = prepared.flatMap((request, requestIndex) =>
			request.denseQueryVariants.map((variant) => ({ requestIndex, variant }))
		);
		const lexicalPromise = db.searchLexicalMany(
			flattenedSparse.map(({ requestIndex, variant }) => ({
				queryText: variant,
				documentIds: prepared[requestIndex].documentIds
			})),
			60
		);
		const fuzzyPromise = db.searchFuzzyMany(
			flattenedSparse.map(({ requestIndex, variant }) => ({
				queryText: variant,
				documentIds: prepared[requestIndex].documentIds
			})),
			60
		);
		const embeddingStartedAt = performance.now();
		const { data, dims } = await this.embedQueries(flattenedDense.map(({ variant }) => variant));
		const embeddingMs = performance.now() - embeddingStartedAt;
		const [lexicalLists, fuzzyLists, denseLists] = await Promise.all([
			lexicalPromise,
			fuzzyPromise,
			db.searchVectorMany(
				data,
				dims,
				flattenedDense.map(({ requestIndex }) => prepared[requestIndex].documentIds),
				60
			)
		]);
		const candidateSearchMs = performance.now() - totalStartedAt;
		const candidateSets = prepared.map((request, requestIndex) => {
			const sparseIndexes = flattenedSparse
				.map((item, index) => (item.requestIndex === requestIndex ? index : -1))
				.filter((index) => index >= 0);
			const denseIndexes = flattenedDense
				.map((item, index) => (item.requestIndex === requestIndex ? index : -1))
				.filter((index) => index >= 0);
			return {
				request,
				semantic: mergeRankedCandidateLists(denseIndexes.map((index) => denseLists[index])),
				lexical: mergeRankedCandidateLists(sparseIndexes.map((index) => lexicalLists[index])),
				fuzzy: mergeRankedCandidateLists(sparseIndexes.map((index) => fuzzyLists[index]))
			};
		});
		const preFusionAnchorIds = [
			...new Set(
				candidateSets.flatMap(({ semantic, lexical, fuzzy }) =>
					[...semantic.slice(0, 48), ...lexical.slice(0, 48), ...fuzzy.slice(0, 48)].map(
						(hit) => hit.chunkId
					)
				)
			)
		];
		const preFusionNeighborsStartedAt = performance.now();
		const preFusionNeighbors = preFusionAnchorIds.length
			? await db.listNeighborChunks(preFusionAnchorIds, 1)
			: [];
		const preFusionNeighborsMs = performance.now() - preFusionNeighborsStartedAt;
		const rankingStartedAt = performance.now();
		const initialRankingStartedAt = performance.now();
		const initialChannels = await mapRankingWorkers<InitialRankingInput, RankedChannels>(
			candidateSets.map(({ request, semantic, lexical, fuzzy }) => ({
				query: request.evidenceQuery,
				route: request.route,
				semantic,
				lexical,
				fuzzy,
				neighbors: preFusionNeighbors
			})),
			(api, input) => api.rankInitialChannels(input) as unknown as Promise<RankedChannels>
		);
		const initialRankingMs = performance.now() - initialRankingStartedAt;
		const channelRankedSets = initialChannels.map((channels, index) => ({
			request: candidateSets[index].request,
			...channels
		}));
		const channelNeighborAnchorIds = [
			...new Set(
				channelRankedSets.flatMap(({ request, semantic, lexical, fuzzy }) => {
					const limit = request.route === 'synthesis' ? 24 : 12;
					return [
						...semantic.slice(0, limit),
						...lexical.slice(0, limit),
						...fuzzy.slice(0, limit)
					].map((hit) => hit.chunkId);
				})
			)
		];
		const channelNeighborsStartedAt = performance.now();
		const channelNeighbors = channelNeighborAnchorIds.length
			? await db.listNeighborChunks(channelNeighborAnchorIds, 1)
			: [];
		const channelNeighborsMs = performance.now() - channelNeighborsStartedAt;

		const fusionRankingStartedAt = performance.now();
		const fusedSets = await mapRankingWorkers<FusionRankingInput, FusionRankingOutput>(
			channelRankedSets.map(({ request, semantic, lexical, fuzzy }) => {
				const limit = request.route === 'synthesis' ? 24 : 12;
				const anchors = [
					...semantic.slice(0, limit),
					...lexical.slice(0, limit),
					...fuzzy.slice(0, limit)
				];
				return {
					query: request.evidenceQuery,
					route: request.route,
					semantic,
					lexical,
					fuzzy,
					neighbors: neighborsForAnchors(channelNeighbors, anchors)
				};
			}),
			(api, input) => api.packAndFuseChannels(input) as unknown as Promise<FusionRankingOutput>
		);
		const fusionRankingMs = performance.now() - fusionRankingStartedAt;
		for (const { request } of channelRankedSets) request.onInspect?.();
		const rankedSets = await Promise.all(
			fusedSets.map(async ({ coarseRanked }, index) => {
				const request = channelRankedSets[index].request;
				const candidateLimit =
					request.route === 'synthesis' || isNumericAnswerQuestion(request.evidenceQuery) ? 48 : 24;
				const structuralChildren = await db.listChildChunksForParents(
					coarseRanked.filter((hit) => hit.paraIndex === -1).map((hit) => hit.chunkId)
				);
				const ranked = expandStructuralParents(
					coarseRanked,
					structuralChildren,
					request.evidenceQuery,
					candidateLimit
				);
				const neighbors = await db.listNeighborChunks(
					ranked.slice(0, request.route === 'synthesis' ? 24 : 12).map((hit) => hit.chunkId),
					analyzeQuestion(request.evidenceQuery).answerShape === 'explanation'
						? 8
						: request.route === 'synthesis'
							? 8
							: 1
				);
				return { ranked, neighbors };
			})
		);
		const finalRankingStartedAt = performance.now();
		const results = await mapRankingWorkers<FinalRankingInput, SearchHit[]>(
			rankedSets.map(({ ranked, neighbors }, index) => ({
				query: channelRankedSets[index].request.evidenceQuery,
				route: channelRankedSets[index].request.route,
				ranked,
				neighbors,
				// A cross-encoder can only reorder what it is handed, so a reranking
				// turn packs a wider pool and lets the reranker cut it back down.
				...(this.rerankAccepted ? { limit: RERANK_CANDIDATES } : {})
			})),
			(api, input) => api.packFinalEvidence(input) as unknown as Promise<SearchHit[]>
		);
		const finalRankingMs = performance.now() - finalRankingStartedAt;
		for (let index = 0; index < results.length; index++) {
			const request = channelRankedSets[index].request;
			const fused = fusedSets[index];
			request.onDiagnostic?.({
				channels: {
					semantic: fused.semantic.map(diagnosticHit),
					lexical: fused.lexical.map(diagnosticHit),
					fuzzy: fused.fuzzy.map(diagnosticHit)
				},
				fused: fused.coarseRanked.map(diagnosticHit),
				neighbors: rankedSets[index].neighbors.map(diagnosticHit),
				final: results[index].map(diagnosticHit)
			});
		}
		const reranked = await this.rerankResults(
			results,
			channelRankedSets.map((set) => set.request.evidenceQuery)
		);
		onBatchTiming?.({
			requests: requests.length,
			sparseVariants: flattenedSparse.length,
			denseVariants: flattenedDense.length,
			embeddingMs,
			candidateSearchMs,
			preFusionNeighborsMs,
			channelNeighborsMs,
			initialRankingMs,
			fusionRankingMs,
			finalRankingMs,
			rankingWorkers: Math.min(requests.length, rankingConcurrency()),
			rankingMs: performance.now() - rankingStartedAt,
			totalMs: performance.now() - totalStartedAt
		});
		return reranked;
	}

	/**
	 * Reorder each result set with the cross-encoder, keeping the best few.
	 *
	 * The retrieval channels score the question and the passage separately and
	 * hope the two representations meet; a cross-encoder reads them together.
	 * Measured on a fee agreement asked "Combien coûtera toute la procédure ?",
	 * where the reader's word and the document's word share no token: the
	 * passage carrying the 1 100 EUR provision ranked 116th of 124 on the
	 * lexical channel, and first after reranking.
	 *
	 * Failure is never fatal. A model that will not load, or a scoring error,
	 * leaves the fused order untouched — the order that shipped before.
	 */
	private async rerankResults(sets: SearchHit[][], queries: string[]): Promise<SearchHit[][]> {
		if (!this.rerankAccepted || !sets.some((set) => set.length > 1)) return sets;
		try {
			const api = getRerankWorker();
			return await Promise.all(
				sets.map(async (hits, index) => {
					if (hits.length < 2) return hits;
					const scores = await api.score(queries[index], hits.map(evidenceText));
					if (scores.length !== hits.length) return hits;
					this.rerankReady = true;
					return hits
						.map((hit, position) => ({ hit, score: scores[position] }))
						.sort((left, right) => right.score - left.score)
						.slice(0, RERANK_KEEP)
						.map((entry) => ({ ...entry.hit, rerankScore: entry.score }));
				})
			);
		} catch (error) {
			this.rerankError = error instanceof Error ? error.message : String(error);
			console.error('[regeste] reranking failed, keeping the fused order:', error);
			return sets;
		}
	}

	/** Accept the download and warm the model, so the first search is not the
	 * one that waits for 544 MB. */
	async enableReranking(): Promise<void> {
		localStorage.setItem(RERANK_CONSENT_KEY, 'yes');
		this.rerankAccepted = true;
		this.rerankError = null;
		try {
			await getRerankWorker().prepare(
				proxy((progress: RerankProgress) => {
					this.rerankDownload = progress;
				})
			);
			this.rerankReady = true;
		} catch (error) {
			this.rerankError = error instanceof Error ? error.message : String(error);
			this.rerankAccepted = false;
			localStorage.removeItem(RERANK_CONSENT_KEY);
		} finally {
			this.rerankDownload = null;
		}
	}

	disableReranking(): void {
		localStorage.removeItem(RERANK_CONSENT_KEY);
		this.rerankAccepted = false;
		this.rerankReady = false;
	}

	/** Dev benchmark ablation: same candidates, isolated by retrieval channel. */
	async retrieveChannelCandidates(
		query: string,
		documentIds: string[] | null = null,
		alternateQueries: string[] = [],
		route: QuestionRoute = analyzeQuestion(query).route
	): Promise<Record<'lexical' | 'fuzzy' | 'dense', SearchHit[]>> {
		const { db } = await getLocalDb();
		const embeddingQuery = query.trim();
		const evidenceQuery = embeddingQuery;
		const queryVariants = [
			...retrievalQueryVariants(embeddingQuery),
			...alternateQueries.flatMap(retrievalQueryVariants)
		].filter((variant, index, all) => all.indexOf(variant) === index);
		const denseVariants = denseRetrievalQueryVariants(embeddingQuery, route, alternateQueries);
		const lexicalPromise = Promise.all(
			queryVariants.map((variant) => db.searchLexical(variant, documentIds, 60))
		);
		const fuzzyPromise = Promise.all(
			queryVariants.map((variant) => db.searchFuzzy(variant, documentIds, 60))
		);
		const { data, dims } = await this.embedQueries(denseVariants);
		const [lexicalLists, fuzzyLists, denseLists] = await Promise.all([
			lexicalPromise,
			fuzzyPromise,
			Promise.all(
				denseVariants.map((_, index) =>
					db.searchVector(data.subarray(index * dims, (index + 1) * dims), dims, documentIds, 60)
				)
			)
		]);
		let lexical = mergeRankedCandidateLists(lexicalLists);
		let fuzzy = mergeRankedCandidateLists(fuzzyLists);
		let dense = mergeRankedCandidateLists(denseLists);
		const preFusionAnchorIds = [
			...new Set(
				[...lexical.slice(0, 48), ...fuzzy.slice(0, 48), ...dense.slice(0, 48)].map(
					(hit) => hit.chunkId
				)
			)
		];
		const preFusionNeighbors = preFusionAnchorIds.length
			? await db.listNeighborChunks(preFusionAnchorIds, 1)
			: [];
		lexical = expandChannelCandidatesWithNeighbors(lexical, preFusionNeighbors, evidenceQuery);
		fuzzy = expandChannelCandidatesWithNeighbors(fuzzy, preFusionNeighbors, evidenceQuery);
		dense = expandChannelCandidatesWithNeighbors(dense, preFusionNeighbors, evidenceQuery);
		const finalize = async (ranked: SearchHit[]) => {
			const candidateLimit =
				route === 'synthesis' || isNumericAnswerQuestion(evidenceQuery) ? 48 : 24;
			const broad = ranked.slice(0, candidateLimit);
			const neighbors = await db.listNeighborChunks(
				broad.slice(0, route === 'synthesis' ? 24 : 12).map((hit) => hit.chunkId),
				analyzeQuestion(evidenceQuery).answerShape === 'explanation'
					? 8
					: route === 'synthesis'
						? 8
						: 1
			);
			return selectWithNeighbors(
				broad,
				neighbors,
				evidenceQuery,
				route === 'synthesis' ? 16 : 10,
				route
			);
		};
		return {
			lexical: await finalize(refineCandidates([], lexical, evidenceQuery, 48, [], route)),
			fuzzy: await finalize(refineCandidates([], [], evidenceQuery, 48, fuzzy, route)),
			dense: await finalize(refineCandidates(dense, [], evidenceQuery, 48, [], route))
		};
	}

	/** Exhaustive local path for numerical questions: no top-k truncation. */
	/**
	 * Schedule rows with their named columns, straight from the chunks.
	 *
	 * Not cached through `document_facts` the way aggregates are: that table
	 * stores one fact per record, which is exactly the shape a column question
	 * cannot use. Reading the chunks is cheap next to a generation, and it keeps
	 * the labels the layout stage produced intact.
	 */
	async scheduleRecords(documentIds: string[]): Promise<FinancialRecord[]> {
		if (!documentIds.length) return [];
		const { db } = await getLocalDb();
		const chunks = await db.listChunksForDocuments(documentIds);
		return extractScheduleRecords(chunks).filter((record) => record.columns?.length);
	}

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
		this.startProcessing(id);
		// Everything after startProcessing runs under try/finally. These first
		// lookups are comlink calls that can reject; leaving them outside meant a
		// rejection stranded the id in processingIds, and since `ingesting` gates
		// the update banner, one failed boot repair disabled updates for the whole
		// session. reindex is auto-invoked at boot, so this was not a rare path.
		let db: LocalDb | null = null;
		let existingChunkCount = 0;
		try {
			db = (await getLocalDb()).db;
			const doc = await db.getDocument(id);
			if (!doc) return;
			existingChunkCount = await db.countChunks(id);
			const data = await readOriginal(doc.hash);
			if (!data) {
				this.setIngest(id, { status: 'error', phaseProgress: 0, error: 'parse_failed' });
				if (existingChunkCount === 0) {
					await db.setDocumentStatus(id, 'error', { error: 'parse_failed' });
				}
				return;
			}
			this.setIngest(id, { status: 'parsing', phaseProgress: 0 });
			const parsed = await parseWithLayout(doc.name, doc.mime, data);
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
				blocks = mergeParsedWithOcr(parsed, ocrBlocks);
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
			} = await this.embedPassages(
				chunks.map((c) => c.searchText),
				(p: EmbedProgress) => {
					this.setIngest(id, {
						status: 'embedding',
						phaseProgress: embeddingPhaseProgress(p.phase, p.progress)
					});
				}
			);
			await db.reindexDocument(id, chunks, vectors, dims, model);
			this.setIngest(id, { status: 'ready', phaseProgress: 1 });
		} catch (err) {
			const code: IngestErrorCode = (err as { code?: IngestErrorCode }).code ?? 'unknown';
			this.setIngest(id, {
				status: 'error',
				phaseProgress: 0,
				error: code,
				diagnostic: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
			});
			if (existingChunkCount === 0) await db?.setDocumentStatus(id, 'error', { error: code });
			console.error('[regeste] re-index failed:', code, err);
		} finally {
			this.endProcessing(id);
			await this.refreshLibrary();
		}
	}

	/**
	 * Spec 023 — automatic on-device OCR of a `scanned` document. Re-parses to find
	 * the image-only pages, OCRs them in a dedicated worker, splices the recognized
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
			const parsed = await parseWithLayout(doc.name, doc.mime, data);
			const needsOcr = parsed.needsOcr ?? [];

			const { ocrPages } = await import('$lib/pipeline/ocr');
			// parseWithLayout no longer detaches `data` (parsePdf slices), and ocrPages
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
			const merged = mergeParsedWithOcr(parsed, ocrBlocks);
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
			} = await this.embedPassages(
				chunks.map((c) => c.searchText),
				(p: EmbedProgress) => {
					this.setIngest(id, {
						status: 'embedding',
						phaseProgress: embeddingPhaseProgress(p.phase, p.progress)
					});
				}
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
				if (code === 'unknown') console.error('[regeste] OCR failed:', err);
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
			const parsed = await parseWithLayout(file.name, file.type, data);
			let blocks = parsed.blocks;
			const needsOcr = parsed.needsOcr ?? [];
			if (needsOcr.length) {
				const { ocrPages } = await import('$lib/pipeline/ocr');
				blocks = mergeParsedWithOcr(parsed, await ocrPages(data, needsOcr));
			}
			const chunks = chunkBlocks(blocks, file.name);
			if (!chunks.length) {
				throw Object.assign(new Error('No usable text'), { code: 'parse_failed' as const });
			}
			const {
				data: vectors,
				dims,
				model
			} = await this.embedPassages(chunks.map((c) => c.searchText));
			const language = detectLanguage(
				blocks
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
