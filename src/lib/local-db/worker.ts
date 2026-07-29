/// <reference lib="webworker" />
// Dedicated worker owning the local SQLite database (OPFS, opfs-sahpool VFS).
// All SQL lives here; the main thread talks to us through Comlink (client.ts).
// opfs-sahpool needs no COOP/COEP headers but allows a single connection —
// the client guards startup with a Web Lock so only one tab owns the DB.

import { expose } from 'comlink';
import { MIGRATIONS } from './schema';
import { fuseCandidates } from '$lib/pipeline/retrieval';
import { RETRIEVAL_VERSION } from '$lib/pipeline/retrieval-version';
import {
	fuzzyIndexText,
	fuzzyQueryGrams,
	lexicalIndexText,
	lexicalStemTokens,
	significantQueryTokens
} from '$lib/pipeline/fuzzy';
import type {
	ChatDocument,
	Chunk,
	LibraryDocument,
	LocalChat,
	LocalDocument,
	LocalMessage,
	MethodSummary,
	SearchHit
} from '$lib/types';

// The sqlite build (sqlite3 + vec0 + FTS5) is served verbatim from
// /vendor/sqlite (copied from the pinned sqlite-vec-wasm-demo package by the
// `prepare` script). It must NOT go through the bundler: vite/rolldown break
// the emscripten glue, and the .wasm sits next to the .mjs so the glue finds
// it by itself. Note: 0.1.9/0.1.10 builds are broken (emscripten assertion
// 'Module.postRun after it has already been processed') — stay on the pinned
// version unless a newer one is verified in-browser.
const SQLITE_DIST_URL = '/vendor/sqlite/sqlite3.mjs';

// The sqlite3 WASM API is untyped upstream; keep the anys contained here.
/* eslint-disable @typescript-eslint/no-explicit-any */
let db: any;
let poolUtil: any;

export interface DbInfo {
	sqliteVersion: string;
	vecVersion: string;
	fts5: boolean;
	vfs: string;
	schemaVersion: number;
}

/**
 * The OPFS SAH pool is NOT multi-context safe: a second tab installing the
 * pool can re-associate its files and silently orphan the database. One
 * exclusive Web Lock, held for the worker's lifetime, guarantees a single
 * owner; later tabs fail fast with 'regeste-db-busy' instead of destroying data.
 */
/** Releases the single-owner lock; set once it is held. */
let releaseLock: (() => void) | null = null;

async function acquireSingleOwnerLock(): Promise<void> {
	const acquired = await new Promise<boolean>((resolve) => {
		navigator.locks
			.request('regeste-db-pool', { ifAvailable: true }, (lock) => {
				if (!lock) {
					resolve(false);
					return;
				}
				resolve(true);
				// Hold until this worker dies with its tab, or until an init that
				// failed after taking it hands it back. Holding it through a failure
				// made the retry report "open in another tab", which sent people
				// hunting for a tab that did not exist while the real fault — the
				// browser refusing storage — scrolled past above it.
				return new Promise<never>((_, reject) => {
					releaseLock = () => reject(new Error('released'));
				});
			})
			.catch(() => resolve(false));
	});
	if (!acquired) throw new Error('regeste-db-busy');
}

// sqlite-wasm auto-installs its async OPFS VFS at bootstrap, which spawns a
// proxy worker (`sqlite3-opfs-async-proxy.js`) that our pinned package does not
// ship. It skips that install when the worker's own URL carries `opfs-disable`.
// In dev, Vite keeps the `?opfs-disable=1` query on the worker URL; the
// production bundler strips it, so the flag is set here deterministically —
// before the sqlite import — by shadowing the read-only worker location with a
// URL that carries it. We use only opfs-sahpool, so the async VFS is dead
// weight; without this it 404s and stalls first init by ~4s (caught, non-fatal).
function forceOpfsDisable(): void {
	try {
		if (new URL(globalThis.location.href).searchParams.has('opfs-disable')) return;
		const href = globalThis.location.href.replace(/#.*$/, '');
		const withFlag = href + (href.includes('?') ? '&' : '?') + 'opfs-disable';
		Object.defineProperty(globalThis, 'location', {
			configurable: true,
			value: new URL(withFlag)
		});
	} catch {
		// Environment forbids the shadow: the async VFS still fails gracefully
		// (onerror + 4s timeout, both caught) — degraded first init, not broken.
	}
}

async function init(): Promise<DbInfo> {
	await acquireSingleOwnerLock();
	try {
		return await openPool();
	} catch (err) {
		// Hand the lock back so a retry reports the real fault instead of
		// inheriting a "busy" that this failure caused.
		releaseLock?.();
		releaseLock = null;
		throw err;
	}
}

async function openPool(): Promise<DbInfo> {
	forceOpfsDisable();
	const { default: sqlite3InitModule } = await import(/* @vite-ignore */ SQLITE_DIST_URL);
	const sqlite3 = await sqlite3InitModule({
		print: () => {},
		printErr: (msg: string) => console.error('[sqlite]', msg)
	});
	try {
		poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'regeste' });
	} catch (err) {
		// Firefox and Safari refuse getDirectory() outright when site storage is
		// blocked — a private window, or content blocking set to strict. Nothing
		// in this app works without it, and the raw SecurityError names neither
		// the cause nor the fix.
		const name = (err as { name?: string })?.name ?? '';
		const message = String((err as { message?: string })?.message ?? err);
		if (name === 'SecurityError' || /GetDirectory|SecurityError/i.test(message)) {
			throw new Error('regeste-db-blocked', { cause: err });
		}
		throw err;
	}
	db = new poolUtil.OpfsSAHPoolDb('/regeste.db');

	// Feature asserts: this build must ship vec0 + FTS5, and we must be on OPFS.
	const vecVersion = db.selectValue('SELECT vec_version()') as string;
	const fts5 = db.selectValue("SELECT count(*) FROM pragma_module_list WHERE name = 'fts5'") === 1;
	if (!vecVersion || !fts5) {
		throw new Error(`local-db: build missing features (vec=${vecVersion}, fts5=${fts5})`);
	}

	db.exec('PRAGMA foreign_keys = ON;');
	const schemaVersion = migrate();
	repairLegacyRetrievalViews();

	return {
		sqliteVersion: db.selectValue('SELECT sqlite_version()') as string,
		vecVersion,
		fts5,
		vfs: 'opfs-sahpool',
		schemaVersion
	};
}

/** Search views can evolve independently of the stored/displayed chunk. Repair
 * them atomically on open so old documents gain filename, fuzzy and stemmed
 * lexical recall without waiting for a costly dense re-embedding. */
function repairLegacyRetrievalViews(): void {
	if (db.selectValue("SELECT value FROM meta WHERE key = 'retrieval_views_v6'") === '1') return;
	db.transaction(() => {
		const rows = db.selectObjects(
			`SELECT c.id, c.search_text, c.text, c.fuzzy_text, d.name AS document_name
			 FROM chunks c JOIN documents d ON d.id = c.document_id`
		);
		for (const row of rows) {
			const oldSearchText = row.search_text ?? row.text;
			const oldFuzzyText = row.fuzzy_text ?? oldSearchText;
			const documentName = String(row.document_name ?? '').trim();
			const hasDocumentName =
				documentName.length > 0 &&
				String(oldSearchText).toLocaleLowerCase().includes(documentName.toLocaleLowerCase());
			const nextSearchText =
				documentName && !hasDocumentName ? `${documentName}\n${oldSearchText}` : oldSearchText;
			const nextFuzzyText = fuzzyIndexText(nextSearchText);
			db.exec({
				sql: "INSERT INTO chunks_fts(chunks_fts, rowid, search_text) VALUES('delete', ?, ?)",
				bind: [row.id, oldSearchText]
			});
			db.exec({
				sql: "INSERT INTO chunks_fuzzy_fts(chunks_fuzzy_fts, rowid, fuzzy_text) VALUES('delete', ?, ?)",
				bind: [row.id, oldFuzzyText]
			});
			db.exec({
				sql: 'UPDATE chunks SET search_text = ?, fuzzy_text = ? WHERE id = ?',
				bind: [nextSearchText, nextFuzzyText, row.id]
			});
			db.exec({
				sql: 'INSERT INTO chunks_fts(rowid, search_text) VALUES (?, ?)',
				bind: [row.id, lexicalIndexText(nextSearchText)]
			});
			db.exec({
				sql: 'INSERT INTO chunks_fuzzy_fts(rowid, fuzzy_text) VALUES (?, ?)',
				bind: [row.id, nextFuzzyText]
			});
		}
		db.exec(
			"INSERT INTO meta(key, value) VALUES ('retrieval_views_v6', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
		);
	});
}

function migrate(): number {
	const hasMeta =
		db.selectValue("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='meta'") === 1;
	let version = hasMeta
		? Number(db.selectValue("SELECT value FROM meta WHERE key = 'schema_version'") ?? 0)
		: 0;
	for (let i = version; i < MIGRATIONS.length; i++) {
		db.transaction(() => {
			db.exec(MIGRATIONS[i]);
			db.exec({
				sql: "INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
				bind: [String(i + 1)]
			});
		});
		version = i + 1;
	}
	return version;
}

function rowToDocument(r: any): LocalDocument {
	return {
		id: r.id,
		hash: r.hash,
		name: r.name,
		mime: r.mime,
		size: r.size,
		pages: r.pages,
		status: r.status,
		error: r.error,
		embeddingModel: r.embedding_model,
		language: r.language ?? null,
		retrievalVersion: r.retrieval_version ?? 1,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	};
}

function getDocumentByHash(hash: string): LocalDocument | null {
	const rows = db.selectObjects('SELECT * FROM documents WHERE hash = ?', [hash]);
	return rows.length ? rowToDocument(rows[0]) : null;
}

function listDocuments(): LocalDocument[] {
	return db.selectObjects('SELECT * FROM documents ORDER BY created_at DESC').map(rowToDocument);
}

function insertDocument(doc: {
	id: string;
	hash: string;
	name: string;
	mime: string;
	size: number;
}): void {
	const now = Date.now();
	db.exec({
		sql: `INSERT INTO documents(id, hash, name, mime, size, status, created_at, updated_at)
		      VALUES (?, ?, ?, ?, ?, 'received', ?, ?)`,
		bind: [doc.id, doc.hash, doc.name, doc.mime, doc.size, now, now]
	});
}

function setDocumentStatus(
	id: string,
	status: string,
	extra?: { error?: string; pages?: number; embeddingModel?: string; language?: string }
): void {
	db.exec({
		sql: `UPDATE documents SET status = ?, error = ?, pages = COALESCE(?, pages),
		      embedding_model = COALESCE(?, embedding_model), language = COALESCE(?, language),
		      updated_at = ? WHERE id = ?`,
		bind: [
			status,
			extra?.error ?? null,
			extra?.pages ?? null,
			extra?.embeddingModel ?? null,
			extra?.language ?? null,
			Date.now(),
			id
		]
	});
}

function deleteChunkIndexes(row: {
	id: number;
	text: string;
	search_text?: string | null;
	fuzzy_text?: string | null;
}): void {
	db.exec({ sql: 'DELETE FROM chunks_vec WHERE rowid = ?', bind: [row.id] });
	db.exec({ sql: 'DELETE FROM chunks_vec_v2 WHERE rowid = ?', bind: [row.id] });
	db.exec({
		sql: "INSERT INTO chunks_fts(chunks_fts, rowid, search_text) VALUES('delete', ?, ?)",
		bind: [row.id, lexicalIndexText(row.search_text ?? row.text)]
	});
	db.exec({
		sql: "INSERT INTO chunks_fuzzy_fts(chunks_fuzzy_fts, rowid, fuzzy_text) VALUES('delete', ?, ?)",
		bind: [row.id, row.fuzzy_text ?? row.search_text ?? row.text]
	});
}

function insertVector(rowid: number, vector: Float32Array, dims: number): void {
	const table = dims === 256 ? 'chunks_vec_v2' : 'chunks_vec';
	db.exec({
		sql: `INSERT INTO ${table}(rowid, embedding) VALUES (?, ?)`,
		bind: [rowid, new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength).slice()]
	});
}

function deleteDocument(id: string): void {
	db.transaction(() => {
		// Real chunk text in the FTS delete: with a dummy value the terms would
		// stay physically indexed — deleted documents must not linger on disk.
		const rows = db.selectObjects(
			'SELECT id, text, search_text, fuzzy_text FROM chunks WHERE document_id = ?',
			[id]
		);
		for (const r of rows) deleteChunkIndexes(r);
		db.exec({ sql: 'DELETE FROM chunks WHERE document_id = ?', bind: [id] });
		db.exec({ sql: 'DELETE FROM documents WHERE id = ?', bind: [id] });
	});
}

/** Remove a document's chunks from all three stores (FTS with real text). */
function deleteChunks(documentId: string): void {
	db.transaction(() => {
		const rows = db.selectObjects(
			'SELECT id, text, search_text, fuzzy_text FROM chunks WHERE document_id = ?',
			[documentId]
		);
		for (const r of rows) deleteChunkIndexes(r);
		db.exec({ sql: 'DELETE FROM document_facts WHERE document_id = ?', bind: [documentId] });
		db.exec({ sql: 'DELETE FROM document_fact_runs WHERE document_id = ?', bind: [documentId] });
		db.exec({ sql: 'DELETE FROM chunks WHERE document_id = ?', bind: [documentId] });
	});
}

/**
 * Atomic version swap (PRD §5): the new content was fully parsed and embedded
 * BEFORE this call; here we audit the old version, drop old chunks, update the
 * document row and insert the new chunks in one transaction.
 */
function replaceDocument(
	id: string,
	meta: { hash: string; name: string; mime: string; size: number; pages: number | null },
	chunks: Chunk[],
	embeddings: Float32Array,
	dims: number,
	language: string | null
): void {
	db.transaction(() => {
		const old = db.selectObjects('SELECT hash FROM documents WHERE id = ?', [id])[0];
		if (old) {
			db.exec({
				sql: 'INSERT INTO document_versions(id, document_id, hash, created_at) VALUES (?, ?, ?, ?)',
				bind: [crypto.randomUUID(), id, old.hash, Date.now()]
			});
		}
		const rows = db.selectObjects(
			'SELECT id, text, search_text, fuzzy_text FROM chunks WHERE document_id = ?',
			[id]
		);
		for (const r of rows) deleteChunkIndexes(r);
		db.exec({ sql: 'DELETE FROM document_facts WHERE document_id = ?', bind: [id] });
		db.exec({ sql: 'DELETE FROM document_fact_runs WHERE document_id = ?', bind: [id] });
		db.exec({ sql: 'DELETE FROM chunks WHERE document_id = ?', bind: [id] });
		db.exec({
			sql: `UPDATE documents SET hash = ?, name = ?, mime = ?, size = ?, pages = ?,
			      language = ?, retrieval_version = ?, status = 'ready', error = NULL, updated_at = ? WHERE id = ?`,
			bind: [
				meta.hash,
				meta.name,
				meta.mime,
				meta.size,
				meta.pages,
				language,
				RETRIEVAL_VERSION,
				Date.now(),
				id
			]
		});
		for (let i = 0; i < chunks.length; i++) {
			const c = chunks[i];
			db.exec({
				sql: `INSERT INTO chunks(document_id, seq, text, search_text, structural_context, fuzzy_text, page, heading_path, para_index, char_start, char_end, ocr_confidence)
				      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				bind: [
					id,
					c.seq,
					c.text,
					c.searchText,
					c.structuralContext ?? null,
					c.fuzzyText ?? c.searchText,
					c.page,
					c.headingPath,
					c.paraIndex,
					c.charStart,
					c.charEnd,
					c.ocrConfidence ?? null
				]
			});
			const rowid = db.selectValue('SELECT last_insert_rowid()') as number;
			db.exec({
				sql: 'INSERT INTO chunks_fts(rowid, search_text) VALUES (?, ?)',
				bind: [rowid, lexicalIndexText(c.searchText)]
			});
			db.exec({
				sql: 'INSERT INTO chunks_fuzzy_fts(rowid, fuzzy_text) VALUES (?, ?)',
				bind: [rowid, c.fuzzyText ?? c.searchText]
			});
			const vec = embeddings.subarray(i * dims, (i + 1) * dims);
			insertVector(rowid, vec, dims);
		}
	});
}

export interface DocumentDetail {
	chats: Array<{ id: string; title: string }>;
	egress: Array<{ createdAt: number; destination: string; mode: string }>;
	versionCount: number;
}

/** D1 — everything the document sheet shows beyond the row itself. */
function documentDetail(id: string): DocumentDetail {
	const chats = db
		.selectObjects(
			`SELECT c.id, c.title FROM chat_documents cd JOIN chats c ON c.id = cd.chat_id
			 WHERE cd.document_id = ? ORDER BY c.updated_at DESC`,
			[id]
		)
		.map((r: any) => ({ id: r.id, title: r.title }));
	const egress = db
		.selectObjects(
			`SELECT DISTINCT pe.created_at, pe.destination, pe.mode
			 FROM privacy_events pe
			 JOIN citations c ON c.message_id = pe.message_id
			 JOIN chunks ch ON ch.id = c.chunk_id
			 WHERE ch.document_id = ? AND pe.destination != 'device'
			 ORDER BY pe.created_at DESC LIMIT 20`,
			[id]
		)
		.map((r: any) => ({ createdAt: r.created_at, destination: r.destination, mode: r.mode }));
	const versionCount = db.selectValue(
		'SELECT count(*) FROM document_versions WHERE document_id = ?',
		[id]
	) as number;
	return { chats, egress, versionCount };
}

/** Insert a batch of chunks with their embeddings (Float32Array, concatenated). */
function insertChunks(
	documentId: string,
	chunks: Chunk[],
	embeddings: Float32Array,
	dims: number
): void {
	db.transaction(() => {
		for (let i = 0; i < chunks.length; i++) {
			const c = chunks[i];
			db.exec({
				sql: `INSERT INTO chunks(document_id, seq, text, search_text, structural_context, fuzzy_text, page, heading_path, para_index, char_start, char_end, ocr_confidence)
				      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				bind: [
					documentId,
					c.seq,
					c.text,
					c.searchText,
					c.structuralContext ?? null,
					c.fuzzyText ?? c.searchText,
					c.page,
					c.headingPath,
					c.paraIndex,
					c.charStart,
					c.charEnd,
					c.ocrConfidence ?? null
				]
			});
			const rowid = db.selectValue('SELECT last_insert_rowid()') as number;
			db.exec({
				sql: 'INSERT INTO chunks_fts(rowid, search_text) VALUES (?, ?)',
				bind: [rowid, lexicalIndexText(c.searchText)]
			});
			db.exec({
				sql: 'INSERT INTO chunks_fuzzy_fts(rowid, fuzzy_text) VALUES (?, ?)',
				bind: [rowid, c.fuzzyText ?? c.searchText]
			});
			const vec = embeddings.subarray(i * dims, (i + 1) * dims);
			insertVector(rowid, vec, dims);
		}
		db.exec({
			sql: 'UPDATE documents SET retrieval_version = ?, updated_at = ? WHERE id = ?',
			bind: [RETRIEVAL_VERSION, Date.now(), documentId]
		});
	});
}

/** Build completes before entry; this transaction swaps every local index at once. */
function reindexDocument(
	documentId: string,
	chunks: Chunk[],
	embeddings: Float32Array,
	dims: number,
	embeddingModel: string
): void {
	db.transaction(() => {
		const rows = db.selectObjects(
			'SELECT id, text, search_text, fuzzy_text FROM chunks WHERE document_id = ?',
			[documentId]
		);
		for (const row of rows) deleteChunkIndexes(row);
		db.exec({ sql: 'DELETE FROM document_facts WHERE document_id = ?', bind: [documentId] });
		db.exec({ sql: 'DELETE FROM document_fact_runs WHERE document_id = ?', bind: [documentId] });
		db.exec({ sql: 'DELETE FROM chunks WHERE document_id = ?', bind: [documentId] });
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			db.exec({
				sql: `INSERT INTO chunks(document_id, seq, text, search_text, structural_context, fuzzy_text, page, heading_path, para_index, char_start, char_end, ocr_confidence)
				      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				bind: [
					documentId,
					chunk.seq,
					chunk.text,
					chunk.searchText,
					chunk.structuralContext ?? null,
					chunk.fuzzyText ?? chunk.searchText,
					chunk.page,
					chunk.headingPath,
					chunk.paraIndex,
					chunk.charStart,
					chunk.charEnd,
					chunk.ocrConfidence ?? null
				]
			});
			const rowid = db.selectValue('SELECT last_insert_rowid()') as number;
			db.exec({
				sql: 'INSERT INTO chunks_fts(rowid, search_text) VALUES (?, ?)',
				bind: [rowid, lexicalIndexText(chunk.searchText)]
			});
			db.exec({
				sql: 'INSERT INTO chunks_fuzzy_fts(rowid, fuzzy_text) VALUES (?, ?)',
				bind: [rowid, chunk.fuzzyText ?? chunk.searchText]
			});
			insertVector(rowid, embeddings.subarray(i * dims, (i + 1) * dims), dims);
		}
		db.exec({
			sql: `UPDATE documents SET embedding_model = ?, retrieval_version = ?, status = 'ready', error = NULL, updated_at = ? WHERE id = ?`,
			bind: [embeddingModel, RETRIEVAL_VERSION, Date.now(), documentId]
		});
	});
}

/** Make arbitrary user input safe for FTS5 MATCH: quoted prefix tokens OR-free. */
function toFtsQuery(q: string): string {
	const tokens = [...new Set([...significantQueryTokens(q), ...lexicalStemTokens(q)])].slice(0, 24);
	if (!tokens.length) return '""';
	return tokens.map((t) => `"${t.replaceAll('"', '')}"`).join(' OR ');
}

function scopeSql(documentIds: string[] | null, column = 'c.document_id') {
	if (!documentIds?.length) return { clause: '', bind: [] as string[] };
	return {
		clause: ` AND ${column} IN (${documentIds.map(() => '?').join(',')})`,
		bind: documentIds
	};
}

/** Lexical candidates start immediately while the query embedding loads. */
function searchLexical(queryText: string, documentIds: string[] | null, limit = 80): SearchHit[] {
	const fts = toFtsQuery(queryText);
	const scope = scopeSql(documentIds);
	return db
		.selectObjects(
			`SELECT c.id AS chunk_id, c.document_id, d.name AS document_name, c.text, c.seq,
			        c.structural_context, c.page, c.heading_path, c.para_index, c.ocr_confidence, bm25(chunks_fts) AS lexical_score
			 FROM chunks_fts
			 JOIN chunks c ON c.id = chunks_fts.rowid
			 JOIN documents d ON d.id = c.document_id
			 WHERE chunks_fts MATCH ? AND d.status = 'ready'${scope.clause}
			 ORDER BY lexical_score LIMIT ?`,
			[fts, ...scope.bind, limit]
		)
		.map((r: any) => ({
			chunkId: r.chunk_id,
			documentId: r.document_id,
			documentName: r.document_name,
			text: r.text,
			structuralContext: r.structural_context ?? null,
			seq: r.seq,
			paraIndex: r.para_index,
			page: r.page,
			headingPath: r.heading_path,
			score: r.lexical_score,
			lexicalScore: r.lexical_score,
			semanticScore: null,
			ocrConfidence: r.ocr_confidence
		}));
}

function searchLexicalMany(
	requests: Array<{ queryText: string; documentIds: string[] | null }>,
	limit = 80
): SearchHit[][] {
	return requests.map((request) => searchLexical(request.queryText, request.documentIds, limit));
}

/** Character-gram candidates tolerate typos/OCR noise without altering the exact word index. */
function searchFuzzy(queryText: string, documentIds: string[] | null, limit = 80): SearchHit[] {
	const grams = fuzzyQueryGrams(queryText);
	if (!grams.length) return [];
	const scope = scopeSql(documentIds);
	return db
		.selectObjects(
			`SELECT c.id AS chunk_id, c.document_id, d.name AS document_name, c.text, c.seq,
			        c.structural_context, c.page, c.heading_path, c.para_index, c.ocr_confidence, bm25(chunks_fuzzy_fts) AS fuzzy_score
			 FROM chunks_fuzzy_fts
			 JOIN chunks c ON c.id = chunks_fuzzy_fts.rowid
			 JOIN documents d ON d.id = c.document_id
			 WHERE chunks_fuzzy_fts MATCH ? AND d.status = 'ready'${scope.clause}
			 ORDER BY fuzzy_score LIMIT ?`,
			[grams.map((gram) => `"${gram.replaceAll('"', '')}"`).join(' OR '), ...scope.bind, limit]
		)
		.map((r: any) => ({
			chunkId: r.chunk_id,
			documentId: r.document_id,
			documentName: r.document_name,
			text: r.text,
			structuralContext: r.structural_context ?? null,
			seq: r.seq,
			paraIndex: r.para_index,
			page: r.page,
			headingPath: r.heading_path,
			score: r.fuzzy_score,
			fuzzyScore: r.fuzzy_score,
			semanticScore: null,
			lexicalScore: null,
			ocrConfidence: r.ocr_confidence
		}));
}

function searchFuzzyMany(
	requests: Array<{ queryText: string; documentIds: string[] | null }>,
	limit = 80
): SearchHit[][] {
	return requests.map((request) => searchFuzzy(request.queryText, request.documentIds, limit));
}

interface VectorScopeStats {
	/** Every row in the vector table, ready or not. vec0's KNN searches the whole
	 * table, so this — not the ready subset — bounds how many out-of-scope rows
	 * can outrank the scoped ones. */
	tableRows: number;
	totalReady: number;
	scopedReady: number;
}

function vectorScopeStats(table: string, documentIds: string[] | null): VectorScopeStats {
	const scope = scopeSql(documentIds);
	const tableRows = Number(db.selectValue(`SELECT count(*) FROM ${table}`));
	const totalReady = Number(
		db.selectValue(
			`SELECT count(*) FROM ${table} v
			 JOIN chunks c ON c.id = v.rowid JOIN documents d ON d.id = c.document_id
			 WHERE d.status = 'ready'`
		)
	);
	const scopedReady = documentIds?.length
		? Number(
				db.selectValue(
					`SELECT count(*) FROM ${table} v
					 JOIN chunks c ON c.id = v.rowid JOIN documents d ON d.id = c.document_id
					 WHERE d.status = 'ready'${scope.clause}`,
					scope.bind
				)
			)
		: totalReady;
	return { tableRows, totalReady, scopedReady };
}

/** vec0 refuses a larger k: "k value in knn query too large, provided %lld and
 * the limit is %lld". Asking for more threw out of retrieval, so the turn
 * produced no answer at all. */
const VEC0_MAX_K = 4096;

/** Returns null when vec0 declines the query, so the caller falls back to the
 * pre-filtered scan instead of losing the turn. */
function knnRows(
	table: string,
	vecBlob: Uint8Array,
	knnK: number,
	scope: { clause: string; bind: string[] },
	limit: number
): Array<Record<string, unknown>> | null {
	try {
		return db.selectObjects(
			`WITH knn AS (
			   SELECT rowid, distance FROM ${table} WHERE embedding MATCH ? AND k = ?
			 )
			 SELECT c.id AS chunk_id, c.document_id, d.name AS document_name, c.text, c.seq,
			        c.structural_context, c.page, c.heading_path, c.para_index, c.ocr_confidence, knn.distance
			 FROM knn JOIN chunks c ON c.id = knn.rowid
			 JOIN documents d ON d.id = c.document_id
			 WHERE d.status = 'ready'${scope.clause}
			 ORDER BY knn.distance LIMIT ?`,
			[vecBlob, knnK, ...scope.bind, limit]
		);
	} catch (error) {
		console.warn('[regeste] vec0 knn declined, using the pre-filtered scan:', error);
		return null;
	}
}

/** Exact scoped KNN. Fetching `limit + out-of-scope rows` from the global KNN
 * is sufficient to guarantee the scoped top-k. Narrow scopes, and budgets vec0
 * cannot serve, use the manual pre-filtered scan instead. */
function searchVector(
	queryEmbedding: Float32Array,
	dims: number,
	documentIds: string[] | null,
	limit = 80,
	stats?: VectorScopeStats
): SearchHit[] {
	const table = dims === 256 ? 'chunks_vec_v2' : 'chunks_vec';
	const vecBlob = new Uint8Array(
		queryEmbedding.buffer,
		queryEmbedding.byteOffset,
		queryEmbedding.byteLength
	).slice();
	const scope = scopeSql(documentIds);
	const { tableRows, scopedReady } = stats ?? vectorScopeStats(table, documentIds);
	// Every row the KNN could return ahead of the scoped ones has to fit inside k,
	// and vec0 refuses k above VEC0_MAX_K ("k value in knn query too large").
	// When the budget does not fit, the pre-filtered scan is the correct answer,
	// not a truncated KNN: it is slower but it cannot silently drop the top hit.
	const requiredK = limit + Math.max(0, tableRows - scopedReady);
	const knnK = Math.min(tableRows, requiredK, VEC0_MAX_K);
	const useKnn = tableRows > 0 && knnK < tableRows * 0.8 && knnK >= Math.min(requiredK, tableRows);
	// vec0 stores L2 (no distance_metric on the table) and every vector is unit
	// normalized, so `1 - d²/2` is the cosine similarity on the KNN path, while
	// the scan asks for the cosine distance directly. The two conversions are not
	// interchangeable: whichever query actually ran decides which one applies.
	const knn = useKnn ? knnRows(table, vecBlob, knnK, scope, limit) : null;
	const rows =
		knn ??
		db.selectObjects(
			`SELECT c.id AS chunk_id, c.document_id, d.name AS document_name, c.text, c.seq,
			        c.structural_context, c.page, c.heading_path, c.para_index, c.ocr_confidence,
		        vec_distance_cosine(v.embedding, ?) AS distance
		 FROM ${table} v
		 JOIN chunks c ON c.id = v.rowid
		 JOIN documents d ON d.id = c.document_id
		 WHERE d.status = 'ready'${scope.clause}
		 ORDER BY distance LIMIT ?`,
			[vecBlob, ...scope.bind, limit]
		);
	const fromKnn = knn !== null;
	return rows.map((r: any) => {
		const cosineSimilarity = fromKnn
			? 1 - (Number(r.distance) * Number(r.distance)) / 2
			: 1 - Number(r.distance);
		return {
			chunkId: r.chunk_id,
			documentId: r.document_id,
			documentName: r.document_name,
			text: r.text,
			structuralContext: r.structural_context ?? null,
			seq: r.seq,
			paraIndex: r.para_index,
			page: r.page,
			headingPath: r.heading_path,
			score: cosineSimilarity,
			semanticScore: cosineSimilarity,
			lexicalScore: null,
			ocrConfidence: r.ocr_confidence
		};
	});
}

function searchVectorMany(
	queryEmbeddings: Float32Array,
	dims: number,
	documentIdsByQuery: Array<string[] | null>,
	limit = 80
): SearchHit[][] {
	if (queryEmbeddings.length !== dims * documentIdsByQuery.length) {
		throw new Error('Vector search batch shape mismatch');
	}
	const table = dims === 256 ? 'chunks_vec_v2' : 'chunks_vec';
	const statsByScope = new Map<string, VectorScopeStats>();
	return documentIdsByQuery.map((documentIds, index) => {
		const key = JSON.stringify(documentIds ? [...documentIds].sort() : null);
		let stats = statsByScope.get(key);
		if (!stats) {
			stats = vectorScopeStats(table, documentIds);
			statsByScope.set(key, stats);
		}
		return searchVector(
			queryEmbeddings.subarray(index * dims, (index + 1) * dims),
			dims,
			documentIds,
			limit,
			stats
		);
	});
}

function listChunksForDocuments(documentIds: string[]): SearchHit[] {
	if (!documentIds.length) return [];
	const scope = scopeSql(documentIds);
	return db
		.selectObjects(
			`SELECT c.id AS chunk_id, c.document_id, d.name AS document_name, c.text, c.seq,
			        c.structural_context, c.page, c.heading_path, c.para_index, c.ocr_confidence
			 FROM chunks c JOIN documents d ON d.id = c.document_id
			 WHERE d.status = 'ready'${scope.clause}
			 ORDER BY c.document_id, c.seq`,
			scope.bind
		)
		.map((r: any) => ({
			chunkId: r.chunk_id,
			documentId: r.document_id,
			documentName: r.document_name,
			text: r.text,
			structuralContext: r.structural_context ?? null,
			seq: r.seq,
			paraIndex: r.para_index,
			page: r.page,
			headingPath: r.heading_path,
			score: 0,
			semanticScore: null,
			lexicalScore: null,
			ocrConfidence: r.ocr_confidence
		}));
}

/** Immediate document-local chunks around selected anchors. */
function listNeighborChunks(chunkIds: number[], radius = 1): SearchHit[] {
	if (!chunkIds.length) return [];
	const placeholders = chunkIds.map(() => '?').join(',');
	return db
		.selectObjects(
			`WITH anchors AS (
				SELECT document_id, seq FROM chunks WHERE id IN (${placeholders})
			)
			SELECT DISTINCT c.id AS chunk_id, c.document_id, d.name AS document_name,
			       c.text, c.seq, c.structural_context, c.page, c.heading_path, c.para_index, c.ocr_confidence
			FROM chunks c
			JOIN documents d ON d.id = c.document_id
			JOIN anchors a ON a.document_id = c.document_id
				AND c.seq BETWEEN a.seq - ? AND a.seq + ?
			WHERE d.status = 'ready'
			ORDER BY c.document_id, c.seq`,
			[...chunkIds, radius, radius]
		)
		.map((r: any) => ({
			chunkId: r.chunk_id,
			documentId: r.document_id,
			documentName: r.document_name,
			text: r.text,
			structuralContext: r.structural_context ?? null,
			seq: r.seq,
			paraIndex: r.para_index,
			page: r.page,
			headingPath: r.heading_path,
			score: 0,
			semanticScore: null,
			lexicalScore: null,
			ocrConfidence: r.ocr_confidence
		}));
}

/** Replace retrieval-only structural parents with their precise citation
 * children. Parents contribute recall/routing only and never enter prompts. */
function listChildChunksForParents(parentIds: number[]): SearchHit[] {
	if (!parentIds.length) return [];
	const placeholders = parentIds.map(() => '?').join(',');
	return db
		.selectObjects(
			`WITH parents AS (
				SELECT id, document_id, page, heading_path, char_start, char_end
				FROM chunks WHERE id IN (${placeholders}) AND para_index = -1
			)
			SELECT DISTINCT p.id AS parent_chunk_id, c.id AS chunk_id, c.document_id,
			       d.name AS document_name, c.text, c.structural_context, c.seq, c.page, c.heading_path,
			       c.para_index, c.ocr_confidence
			FROM parents p
			JOIN chunks c ON c.document_id = p.document_id
			 AND COALESCE(c.para_index, 0) != -1
			 AND c.char_end >= p.char_start AND c.char_start <= p.char_end
			 AND ((p.page IS NOT NULL AND c.page = p.page)
			   OR (p.page IS NULL AND c.page IS NULL AND c.heading_path IS p.heading_path))
			JOIN documents d ON d.id = c.document_id
			WHERE d.status = 'ready'
			ORDER BY p.id, c.seq`,
			parentIds
		)
		.map((r: any) => ({
			chunkId: r.chunk_id,
			parentChunkId: r.parent_chunk_id,
			documentId: r.document_id,
			documentName: r.document_name,
			text: r.text,
			structuralContext: r.structural_context ?? null,
			seq: r.seq,
			paraIndex: r.para_index,
			page: r.page,
			headingPath: r.heading_path,
			score: 0,
			semanticScore: null,
			lexicalScore: null,
			fuzzyScore: null,
			ocrConfidence: r.ocr_confidence
		}));
}

/** Hybrid search: FTS5 BM25 + vec0 KNN fused with RRF (k=60). */
function search(
	queryEmbedding: Float32Array,
	queryText: string,
	documentIds: string[] | null,
	topK = 8
): SearchHit[] {
	return fuseCandidates(
		searchVector(queryEmbedding, queryEmbedding.length, documentIds, 80),
		searchLexical(queryText, documentIds, 80),
		topK
	);
}

export interface ChunkWithDocument {
	chunkId: number;
	text: string;
	page: number | null;
	headingPath: string | null;
	charStart: number;
	charEnd: number;
	document: LocalDocument;
}

/** Chunk + owning document, for the citation viewer. Null when the chunk is gone. */
function getChunk(chunkId: number): ChunkWithDocument | null {
	const rows = db.selectObjects(
		`SELECT c.id AS chunk_id, c.text AS chunk_text, c.page AS chunk_page,
		        c.heading_path, c.char_start, c.char_end, d.*
		 FROM chunks c JOIN documents d ON d.id = c.document_id
		 WHERE c.id = ?`,
		[chunkId]
	);
	if (!rows.length) return null;
	const r = rows[0];
	return {
		chunkId: r.chunk_id,
		text: r.chunk_text,
		page: r.chunk_page,
		headingPath: r.heading_path,
		charStart: r.char_start,
		charEnd: r.char_end,
		document: rowToDocument(r)
	};
}

function getDocument(id: string): LocalDocument | null {
	const rows = db.selectObjects('SELECT * FROM documents WHERE id = ?', [id]);
	return rows.length ? rowToDocument(rows[0]) : null;
}

function countChunks(documentId: string): number {
	return db.selectValue('SELECT count(*) FROM chunks WHERE document_id = ?', [
		documentId
	]) as number;
}

function databaseBytes(): number {
	return Number(db.selectValue('PRAGMA page_count')) * Number(db.selectValue('PRAGMA page_size'));
}

// ── Chats / messages / attachments ──────────────────────────────────────────

function rowToChat(r: any): LocalChat {
	return {
		id: r.id,
		title: r.title,
		mode: r.mode,
		privateOnly: !!r.private_only,
		myaiModel: r.myai_model ?? null,
		pinned: !!r.pinned,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	};
}

function createChat(chat: { id: string; title: string; mode: string }): void {
	const now = Date.now();
	db.exec({
		sql: 'INSERT INTO chats(id, title, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
		bind: [chat.id, chat.title, chat.mode, now, now]
	});
}

function listChats(): LocalChat[] {
	return db.selectObjects('SELECT * FROM chats ORDER BY updated_at DESC').map(rowToChat);
}

function renameChat(id: string, title: string): void {
	db.exec({ sql: 'UPDATE chats SET title = ? WHERE id = ?', bind: [title, id] });
}

function setChatMode(id: string, mode: string): void {
	db.exec({ sql: 'UPDATE chats SET mode = ? WHERE id = ?', bind: [mode, id] });
}

function setChatMyaiModel(id: string, model: string | null): void {
	db.exec({ sql: 'UPDATE chats SET myai_model = ? WHERE id = ?', bind: [model, id] });
}

function setChatPinned(id: string, pinned: boolean): void {
	db.exec({ sql: 'UPDATE chats SET pinned = ? WHERE id = ?', bind: [pinned ? 1 : 0, id] });
}

/** Delete one message (C2 regenerate/edit): FTS row first, then the row. */
function deleteMessage(id: string): void {
	db.transaction(() => {
		const rows = db.selectObjects('SELECT rowid, content FROM messages WHERE id = ?', [id]);
		for (const r of rows) {
			db.exec({
				sql: "INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', ?, ?)",
				bind: [r.rowid, r.content]
			});
		}
		db.exec({ sql: 'DELETE FROM messages WHERE id = ?', bind: [id] });
	});
}

// ── Answer versions (spec 020) ──────────────────────────────────────────────

/**
 * Retire the active answer of a turn before regenerating: it stays on disk as
 * an inactive version (FTS row removed so search only hits active content).
 */
function retireMessage(id: string, versionGroup: string): void {
	db.transaction(() => {
		const rows = db.selectObjects('SELECT rowid, content FROM messages WHERE id = ?', [id]);
		for (const r of rows) {
			db.exec({
				sql: "INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', ?, ?)",
				bind: [r.rowid, r.content]
			});
		}
		db.exec({
			sql: 'UPDATE messages SET active = 0, version_group = ? WHERE id = ?',
			bind: [versionGroup, id]
		});
	});
}

/** All versions of every multi-version turn in a chat, oldest first. */
function listChatMessageVersions(chatId: string): { versionGroup: string; id: string }[] {
	return db
		.selectObjects(
			'SELECT version_group, id FROM messages WHERE chat_id = ? AND version_group IS NOT NULL ORDER BY created_at, rowid',
			[chatId]
		)
		.map((r: any) => ({ versionGroup: r.version_group, id: r.id }));
}

/** Make one version of a turn the displayed one (FTS follows the active row). */
function activateMessageVersion(versionGroup: string, id: string): void {
	db.transaction(() => {
		const current = db.selectObjects(
			'SELECT rowid, content FROM messages WHERE version_group = ? AND active = 1',
			[versionGroup]
		);
		for (const r of current) {
			db.exec({
				sql: "INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', ?, ?)",
				bind: [r.rowid, r.content]
			});
		}
		db.exec({
			sql: 'UPDATE messages SET active = 0 WHERE version_group = ?',
			bind: [versionGroup]
		});
		db.exec({ sql: 'UPDATE messages SET active = 1 WHERE id = ?', bind: [id] });
		const target = db.selectObjects('SELECT rowid, content FROM messages WHERE id = ?', [id]);
		for (const r of target) {
			db.exec({
				sql: 'INSERT INTO messages_fts(rowid, content) VALUES (?, ?)',
				bind: [r.rowid, r.content]
			});
		}
	});
}

// ── Settings (meta table, 'setting:' prefix keeps schema_version untouched) ──

function getSetting(key: string): string | null {
	return (
		(db.selectValue('SELECT value FROM meta WHERE key = ?', [`setting:${key}`]) as
			string | undefined) ?? null
	);
}

function setSetting(key: string, value: string | null): void {
	if (value === null) {
		db.exec({ sql: 'DELETE FROM meta WHERE key = ?', bind: [`setting:${key}`] });
		return;
	}
	db.exec({
		sql: 'INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
		bind: [`setting:${key}`, value]
	});
}

function touchChat(id: string): void {
	db.exec({ sql: 'UPDATE chats SET updated_at = ? WHERE id = ?', bind: [Date.now(), id] });
}

function deleteChat(id: string): void {
	db.transaction(() => {
		// External-content FTS5 rows must be deleted explicitly (with the original
		// text, so the terms really leave the index) before the source rows.
		const rows = db.selectObjects('SELECT rowid, content FROM messages WHERE chat_id = ?', [id]);
		for (const r of rows) {
			db.exec({
				sql: "INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', ?, ?)",
				bind: [r.rowid, r.content]
			});
		}
		db.exec({ sql: 'DELETE FROM chats WHERE id = ?', bind: [id] });
	});
}

function insertMessage(m: {
	id: string;
	chatId: string;
	role: string;
	content: string;
	mode: string | null;
	versionGroup?: string | null;
}): void {
	db.exec({
		sql: 'INSERT INTO messages(id, chat_id, role, content, mode, created_at, version_group, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
		bind: [m.id, m.chatId, m.role, m.content, m.mode, Date.now(), m.versionGroup ?? null]
	});
	// External-content FTS must mirror the messages table 1:1 (retrieval-preview
	// rows are filtered at query time, in searchAll).
	const rowid = db.selectValue('SELECT last_insert_rowid()') as number;
	db.exec({
		sql: 'INSERT INTO messages_fts(rowid, content) VALUES (?, ?)',
		bind: [rowid, m.content]
	});
}

function listMessages(chatId: string): LocalMessage[] {
	return db
		.selectObjects(
			'SELECT * FROM messages WHERE chat_id = ? AND active = 1 ORDER BY created_at, rowid',
			[chatId]
		)
		.map((r: any) => ({
			id: r.id,
			chatId: r.chat_id,
			role: r.role,
			content: r.content,
			mode: r.mode,
			createdAt: r.created_at,
			versionGroup: r.version_group ?? null
		}));
}

function attachDocument(chatId: string, documentId: string): void {
	db.exec({
		sql: 'INSERT OR IGNORE INTO chat_documents(chat_id, document_id, added_at) VALUES (?, ?, ?)',
		bind: [chatId, documentId, Date.now()]
	});
}

function detachDocument(chatId: string, documentId: string): void {
	db.exec({
		sql: 'DELETE FROM chat_documents WHERE chat_id = ? AND document_id = ?',
		bind: [chatId, documentId]
	});
}

function setDocumentEnabled(chatId: string, documentId: string, enabled: boolean): void {
	db.exec({
		sql: 'UPDATE chat_documents SET enabled = ? WHERE chat_id = ? AND document_id = ?',
		bind: [enabled ? 1 : 0, chatId, documentId]
	});
}

function listChatDocuments(chatId: string): ChatDocument[] {
	return db
		.selectObjects(
			`SELECT d.*, cd.enabled FROM chat_documents cd
			 JOIN documents d ON d.id = cd.document_id
			 WHERE cd.chat_id = ? ORDER BY cd.added_at DESC`,
			[chatId]
		)
		.map((r: any) => ({ ...rowToDocument(r), enabled: !!r.enabled }));
}

function listLibrary(): LibraryDocument[] {
	return db
		.selectObjects(
			`SELECT d.*, (SELECT count(*) FROM chat_documents cd WHERE cd.document_id = d.id) AS chat_count
			 FROM documents d ORDER BY d.created_at DESC`
		)
		.map((r: any) => ({ ...rowToDocument(r), chatCount: r.chat_count }));
}

function documentUsage(documentId: string): number {
	return db.selectValue('SELECT count(*) FROM chat_documents WHERE document_id = ?', [
		documentId
	]) as number;
}

// ── Universal search (spec 008): FTS over messages + document chunks ────────

export interface SearchAllResult {
	chats: Array<{ chatId: string; title: string; snippet: string }>;
	documents: Array<{
		chunkId: number;
		documentId: string;
		name: string;
		snippet: string;
		page: number | null;
		headingPath: string | null;
	}>;
}

function searchAll(query: string, limit = 8): SearchAllResult {
	const fts = toFtsQuery(query);
	const chatRows = db.selectObjects(
		`SELECT c.id AS chat_id, c.title, snippet(messages_fts, 0, '', '', '…', 12) AS snip
		 FROM messages_fts
		 JOIN messages m ON m.rowid = messages_fts.rowid
		 JOIN chats c ON c.id = m.chat_id
		 WHERE messages_fts MATCH ? AND (m.mode IS NULL OR m.mode != 'retrieval')
		 ORDER BY rank LIMIT 24`,
		[fts]
	);
	const seenChats = new Set<string>();
	const chats: SearchAllResult['chats'] = [];
	for (const r of chatRows) {
		if (seenChats.has(r.chat_id)) continue;
		seenChats.add(r.chat_id);
		chats.push({ chatId: r.chat_id, title: r.title, snippet: r.snip });
		if (chats.length >= limit) break;
	}
	const documents = db
		.selectObjects(
			`SELECT ch.id AS chunk_id, ch.document_id, d.name, ch.page, ch.heading_path,
			        snippet(chunks_fts, 0, '', '', '…', 12) AS snip
			 FROM chunks_fts
			 JOIN chunks ch ON ch.id = chunks_fts.rowid
			 JOIN documents d ON d.id = ch.document_id
			 WHERE chunks_fts MATCH ? AND d.status = 'ready' ORDER BY rank LIMIT ?`,
			[fts, limit]
		)
		.map((r: any) => ({
			chunkId: r.chunk_id,
			documentId: r.document_id,
			name: r.name,
			snippet: r.snip,
			page: r.page,
			headingPath: r.heading_path
		}));
	return { chats, documents };
}

// ── What AI saw (spec 012) ───────────────────────────────────────────────────

export interface MessageExcerptRow {
	messageId: string;
	chunkId: number | null;
	sent: boolean;
	excluded: boolean;
	snippet: string;
	documentName: string;
	locator: string | null;
}

function insertMessageExcerpts(
	messageId: string,
	rows: Array<{
		chunkId: number | null;
		sent: boolean;
		excluded: boolean;
		snippet: string;
		documentName: string;
		locator: string | null;
	}>
): void {
	db.transaction(() => {
		for (const r of rows) {
			db.exec({
				sql: `INSERT INTO message_excerpts(id, message_id, chunk_id, sent, excluded, snippet, document_name, locator, created_at)
				      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				bind: [
					crypto.randomUUID(),
					messageId,
					r.chunkId,
					r.sent ? 1 : 0,
					r.excluded ? 1 : 0,
					r.snippet,
					r.documentName,
					r.locator,
					Date.now()
				]
			});
		}
	});
}

function listChatMessageExcerpts(chatId: string): MessageExcerptRow[] {
	return db
		.selectObjects(
			`SELECT me.message_id, me.chunk_id, me.sent, me.excluded, me.snippet, me.document_name, me.locator
			 FROM message_excerpts me JOIN messages m ON m.id = me.message_id
			 WHERE m.chat_id = ? ORDER BY me.created_at, me.rowid`,
			[chatId]
		)
		.map((r: any) => ({
			messageId: r.message_id,
			chunkId: r.chunk_id,
			sent: !!r.sent,
			excluded: !!r.excluded,
			snippet: r.snippet,
			documentName: r.document_name,
			locator: r.locator
		}));
}

// ── Citations & privacy events ───────────────────────────────────────────────

function insertCitations(
	messageId: string,
	rows: Array<{ chunkId: number; snippet: string; documentName: string; locator: string | null }>
): void {
	db.transaction(() => {
		for (const r of rows) {
			db.exec({
				sql: `INSERT INTO citations(id, message_id, chunk_id, snippet, document_name, locator, created_at)
				      VALUES (?, ?, ?, ?, ?, ?, ?)`,
				bind: [
					crypto.randomUUID(),
					messageId,
					r.chunkId,
					r.snippet,
					r.documentName,
					r.locator,
					Date.now()
				]
			});
		}
	});
}

export interface CitationRow {
	messageId: string;
	chunkId: number | null;
	snippet: string;
	documentName: string;
	locator: string | null;
}

function listChatCitations(chatId: string): CitationRow[] {
	return db
		.selectObjects(
			`SELECT c.message_id, c.chunk_id, c.snippet, c.document_name, c.locator
			 FROM citations c JOIN messages m ON m.id = c.message_id
			 WHERE m.chat_id = ? ORDER BY c.created_at, c.rowid`,
			[chatId]
		)
		.map((r: any) => ({
			messageId: r.message_id,
			chunkId: r.chunk_id,
			snippet: r.snippet,
			documentName: r.document_name,
			locator: r.locator
		}));
}

function insertPrivacyEvent(e: {
	chatId: string | null;
	messageId: string | null;
	mode: string;
	destination: string;
	excerptCount: number;
	bytesSent: number;
}): void {
	db.exec({
		sql: `INSERT INTO privacy_events(id, chat_id, message_id, mode, destination, excerpt_count, bytes_sent, created_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		bind: [
			crypto.randomUUID(),
			e.chatId,
			e.messageId,
			e.mode,
			e.destination,
			e.excerptCount,
			e.bytesSent,
			Date.now()
		]
	});
}

export interface PrivacyEventRow {
	mode: string;
	destination: string;
	excerptCount: number;
	bytesSent: number;
	createdAt: number;
}

export interface MessagePrivacyRow {
	messageId: string;
	mode: string;
	destination: string;
	excerptCount: number;
	bytesSent: number;
}

function listChatPrivacyEvents(chatId: string): MessagePrivacyRow[] {
	return db
		.selectObjects(
			`SELECT message_id, mode, destination, excerpt_count, bytes_sent
			 FROM privacy_events WHERE chat_id = ? AND message_id IS NOT NULL`,
			[chatId]
		)
		.map((r: any) => ({
			messageId: r.message_id,
			mode: r.mode,
			destination: r.destination,
			excerptCount: r.excerpt_count,
			bytesSent: r.bytes_sent
		}));
}

export interface PrivacySummaryRow {
	destination: string;
	requests: number;
	bytes: number;
}

function privacySummary(): PrivacySummaryRow[] {
	return db
		.selectObjects(
			`SELECT destination, count(*) AS requests, COALESCE(sum(bytes_sent), 0) AS bytes
			 FROM privacy_events GROUP BY destination ORDER BY bytes DESC, requests DESC`
		)
		.map((r: any) => ({ destination: r.destination, requests: r.requests, bytes: r.bytes }));
}

/** P2: one chat's egress state — cloud requests and bytes that left. */
function chatPrivacySummary(chatId: string): { cloudRequests: number; bytes: number } {
	const r = db.selectObjects(
		`SELECT count(*) AS n, COALESCE(sum(bytes_sent), 0) AS bytes
		 FROM privacy_events WHERE chat_id = ? AND destination != 'device'`,
		[chatId]
	)[0];
	return { cloudRequests: r.n, bytes: r.bytes };
}

export interface DocumentEgressRow {
	documentId: string;
	lastSentAt: number;
}

/**
 * P3: documents whose excerpts left the device, via the citations of cloud
 * answers (assisted/myai). Citation-less sends aren't attributable — the badge
 * is evidence, not accounting.
 */
function documentEgress(): DocumentEgressRow[] {
	return db
		.selectObjects(
			`SELECT ch.document_id, max(pe.created_at) AS last_sent
			 FROM privacy_events pe
			 JOIN citations c ON c.message_id = pe.message_id
			 JOIN chunks ch ON ch.id = c.chunk_id
			 WHERE pe.destination != 'device'
			 GROUP BY ch.document_id`
		)
		.map((r: any) => ({ documentId: r.document_id, lastSentAt: r.last_sent }));
}

/** P4: last-7-days egress per destination. */
function weekPrivacySummary(): PrivacySummaryRow[] {
	const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
	return db
		.selectObjects(
			`SELECT destination, count(*) AS requests, COALESCE(sum(bytes_sent), 0) AS bytes
			 FROM privacy_events WHERE created_at >= ? GROUP BY destination ORDER BY bytes DESC`,
			[since]
		)
		.map((r: any) => ({ destination: r.destination, requests: r.requests, bytes: r.bytes }));
}

function setChatPrivateOnly(id: string, privateOnly: boolean): void {
	db.exec({
		sql: 'UPDATE chats SET private_only = ? WHERE id = ?',
		bind: [privateOnly ? 1 : 0, id]
	});
}

function listPrivacyEvents(limit = 100): PrivacyEventRow[] {
	return db
		.selectObjects(
			'SELECT mode, destination, excerpt_count, bytes_sent, created_at FROM privacy_events ORDER BY created_at DESC LIMIT ?',
			[limit]
		)
		.map((r: any) => ({
			mode: r.mode,
			destination: r.destination,
			excerptCount: r.excerpt_count,
			bytesSent: r.bytes_sent,
			createdAt: r.created_at
		}));
}

export interface DocumentFactRow {
	id: string;
	documentId: string;
	chunkId: number | null;
	extractorVersion: string;
	kind: string;
	label: string;
	valueMinor: number;
	currency: string;
	confidence: number;
	recordKey: string;
	recordDate: string | null;
	recordId: string | null;
}

function replaceDocumentFacts(
	documentId: string,
	extractorVersion: string,
	facts: Array<{
		chunkId: number | null;
		kind: string;
		label: string;
		valueMinor: number;
		currency: string;
		confidence: number;
		recordKey: string;
		recordDate: string | null;
		recordId: string | null;
	}>
): void {
	db.transaction(() => {
		db.exec({
			sql: 'DELETE FROM document_facts WHERE document_id = ? AND extractor_version = ?',
			bind: [documentId, extractorVersion]
		});
		for (const fact of facts) {
			db.exec({
				sql: `INSERT INTO document_facts(
				        id, document_id, chunk_id, extractor_version, kind, label,
				        value_minor, currency, confidence, record_key, record_date,
				        record_id, created_at
				      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				bind: [
					crypto.randomUUID(),
					documentId,
					fact.chunkId,
					extractorVersion,
					fact.kind,
					fact.label,
					fact.valueMinor,
					fact.currency,
					fact.confidence,
					fact.recordKey,
					fact.recordDate,
					fact.recordId,
					Date.now()
				]
			});
		}
		db.exec({
			sql: `INSERT INTO document_fact_runs(document_id, extractor_version, completed_at)
			      VALUES (?, ?, ?) ON CONFLICT(document_id, extractor_version)
			      DO UPDATE SET completed_at = excluded.completed_at`,
			bind: [documentId, extractorVersion, Date.now()]
		});
	});
}

function listDocumentFactRunIds(documentIds: string[], extractorVersion: string): string[] {
	if (!documentIds.length) return [];
	return db
		.selectObjects(
			`SELECT document_id FROM document_fact_runs WHERE extractor_version = ?
			 AND document_id IN (${documentIds.map(() => '?').join(',')})`,
			[extractorVersion, ...documentIds]
		)
		.map((row: any) => row.document_id);
}

function listMoneyFacts(
	documentIds: string[],
	extractorVersion: string
): Array<
	DocumentFactRow & {
		documentName: string;
		text: string;
		page: number | null;
		headingPath: string | null;
	}
> {
	if (!documentIds.length) return [];
	return db
		.selectObjects(
			`SELECT f.*, d.name AS document_name, c.text, c.structural_context, c.page, c.heading_path
			 FROM document_facts f JOIN documents d ON d.id = f.document_id
			 LEFT JOIN chunks c ON c.id = f.chunk_id
			 WHERE f.extractor_version = ?
			 AND f.document_id IN (${documentIds.map(() => '?').join(',')})`,
			[extractorVersion, ...documentIds]
		)
		.map((row: any) => ({
			id: row.id,
			documentId: row.document_id,
			chunkId: row.chunk_id,
			extractorVersion: row.extractor_version,
			kind: row.kind,
			label: row.label,
			valueMinor: row.value_minor,
			currency: row.currency,
			confidence: row.confidence,
			recordKey: row.record_key,
			recordDate: row.record_date,
			recordId: row.record_id,
			documentName: row.document_name,
			text: row.text ?? '',
			page: row.page,
			headingPath: row.heading_path
		}));
}

function listDocumentFacts(documentIds: string[], extractorVersion: string): DocumentFactRow[] {
	if (!documentIds.length) return [];
	return db
		.selectObjects(
			`SELECT * FROM document_facts
			 WHERE extractor_version = ?
			   AND document_id IN (${documentIds.map(() => '?').join(',')})`,
			[extractorVersion, ...documentIds]
		)
		.map((r: any) => ({
			id: r.id,
			documentId: r.document_id,
			chunkId: r.chunk_id,
			extractorVersion: r.extractor_version,
			kind: r.kind,
			label: r.label,
			valueMinor: r.value_minor,
			currency: r.currency,
			confidence: r.confidence,
			recordKey: r.record_key,
			recordDate: r.record_date,
			recordId: r.record_id
		}));
}

function insertMessageMethod(messageId: string, summary: MethodSummary): void {
	db.exec({
		sql: `INSERT INTO message_methods(message_id, summary_json, created_at)
		      VALUES (?, ?, ?)
		      ON CONFLICT(message_id) DO UPDATE SET summary_json = excluded.summary_json`,
		bind: [messageId, JSON.stringify(summary), Date.now()]
	});
}

function listChatMessageMethods(
	chatId: string
): Array<{ messageId: string; summary: MethodSummary }> {
	return db
		.selectObjects(
			`SELECT mm.message_id, mm.summary_json
			 FROM message_methods mm JOIN messages m ON m.id = mm.message_id
			 WHERE m.chat_id = ?`,
			[chatId]
		)
		.map((r: any) => ({ messageId: r.message_id, summary: JSON.parse(r.summary_json) }));
}

/**
 * T1 panic wipe, database half: close the connection and destroy every file
 * in the SAH pool (the pool holds exclusive OPFS handles, so the main thread
 * cannot remove them itself).
 */
async function wipeDatabase(): Promise<void> {
	try {
		db?.close();
	} catch {
		// already closed — the pool wipe below is what matters
	}
	await poolUtil?.wipeFiles();
}

/**
 * R1 (spec 015) — full local dump for the workspace export. Everything the
 * user owns, minus embeddings/chunks (rebuilt by re-ingesting the originals).
 */
function exportData(): Record<string, unknown> {
	const table = (name: string) => db.selectObjects(`SELECT * FROM ${name}`);
	return {
		exportedAt: new Date().toISOString(),
		version: db.selectValue("SELECT value FROM meta WHERE key = 'schema_version'"),
		settings: db.selectObjects("SELECT key, value FROM meta WHERE key LIKE 'setting:%'"),
		documents: table('documents'),
		documentVersions: table('document_versions'),
		chats: table('chats'),
		messages: table('messages'),
		chatDocuments: table('chat_documents'),
		citations: table('citations'),
		messageExcerpts: table('message_excerpts'),
		messageMethods: table('message_methods'),
		documentFacts: table('document_facts'),
		documentFactRuns: table('document_fact_runs'),
		privacyEvents: table('privacy_events')
	};
}

const api = {
	init,
	wipeDatabase,
	exportData,
	getDocumentByHash,
	listDocuments,
	insertDocument,
	setDocumentStatus,
	deleteDocument,
	insertChunks,
	reindexDocument,
	deleteChunks,
	replaceDocument,
	documentDetail,
	search,
	searchLexical,
	searchLexicalMany,
	searchFuzzy,
	searchFuzzyMany,
	searchVector,
	searchVectorMany,
	listChunksForDocuments,
	listNeighborChunks,
	listChildChunksForParents,
	countChunks,
	databaseBytes,
	getChunk,
	getDocument,
	createChat,
	listChats,
	renameChat,
	setChatMode,
	setChatMyaiModel,
	setChatPinned,
	deleteMessage,
	retireMessage,
	listChatMessageVersions,
	activateMessageVersion,
	getSetting,
	setSetting,
	touchChat,
	deleteChat,
	insertMessage,
	listMessages,
	attachDocument,
	detachDocument,
	setDocumentEnabled,
	listChatDocuments,
	listLibrary,
	documentUsage,
	insertCitations,
	listChatCitations,
	insertMessageExcerpts,
	listChatMessageExcerpts,
	insertPrivacyEvent,
	listPrivacyEvents,
	listChatPrivacyEvents,
	privacySummary,
	chatPrivacySummary,
	documentEgress,
	weekPrivacySummary,
	replaceDocumentFacts,
	listDocumentFacts,
	listDocumentFactRunIds,
	listMoneyFacts,
	insertMessageMethod,
	listChatMessageMethods,
	setChatPrivateOnly,
	searchAll
};

export type DbApi = typeof api;

expose(api);
