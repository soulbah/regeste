/// <reference lib="webworker" />
// Dedicated worker owning the local SQLite database (OPFS, opfs-sahpool VFS).
// All SQL lives here; the main thread talks to us through Comlink (client.ts).
// opfs-sahpool needs no COOP/COEP headers but allows a single connection —
// the client guards startup with a Web Lock so only one tab owns the DB.

import { expose } from 'comlink';
import { MIGRATIONS } from './schema';
import type {
	ChatDocument,
	Chunk,
	LibraryDocument,
	LocalChat,
	LocalDocument,
	LocalMessage,
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

export interface DbInfo {
	sqliteVersion: string;
	vecVersion: string;
	fts5: boolean;
	vfs: string;
	schemaVersion: number;
}

async function init(): Promise<DbInfo> {
	const { default: sqlite3InitModule } = await import(/* @vite-ignore */ SQLITE_DIST_URL);
	const sqlite3 = await sqlite3InitModule({
		print: () => {},
		printErr: (msg: string) => console.error('[sqlite]', msg)
	});
	const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'folio' });
	db = new poolUtil.OpfsSAHPoolDb('/folio.db');

	// Feature asserts: this build must ship vec0 + FTS5, and we must be on OPFS.
	const vecVersion = db.selectValue('SELECT vec_version()') as string;
	const fts5 = db.selectValue("SELECT count(*) FROM pragma_module_list WHERE name = 'fts5'") === 1;
	if (!vecVersion || !fts5) {
		throw new Error(`local-db: build missing features (vec=${vecVersion}, fts5=${fts5})`);
	}

	db.exec('PRAGMA foreign_keys = ON;');
	const schemaVersion = migrate();

	return {
		sqliteVersion: db.selectValue('SELECT sqlite_version()') as string,
		vecVersion,
		fts5,
		vfs: 'opfs-sahpool',
		schemaVersion
	};
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
	extra?: { error?: string; pages?: number; embeddingModel?: string }
): void {
	db.exec({
		sql: `UPDATE documents SET status = ?, error = ?, pages = COALESCE(?, pages),
		      embedding_model = COALESCE(?, embedding_model), updated_at = ? WHERE id = ?`,
		bind: [
			status,
			extra?.error ?? null,
			extra?.pages ?? null,
			extra?.embeddingModel ?? null,
			Date.now(),
			id
		]
	});
}

function deleteDocument(id: string): void {
	db.transaction(() => {
		const ids = db
			.selectObjects('SELECT id FROM chunks WHERE document_id = ?', [id])
			.map((r: any) => r.id);
		for (const chunkId of ids) {
			db.exec({ sql: 'DELETE FROM chunks_vec WHERE rowid = ?', bind: [chunkId] });
			db.exec({
				sql: "INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES('delete', ?, '')",
				bind: [chunkId]
			});
		}
		db.exec({ sql: 'DELETE FROM chunks WHERE document_id = ?', bind: [id] });
		db.exec({ sql: 'DELETE FROM documents WHERE id = ?', bind: [id] });
	});
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
				sql: `INSERT INTO chunks(document_id, seq, text, page, heading_path, para_index, char_start, char_end)
				      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				bind: [
					documentId,
					c.seq,
					c.text,
					c.page,
					c.headingPath,
					c.paraIndex,
					c.charStart,
					c.charEnd
				]
			});
			const rowid = db.selectValue('SELECT last_insert_rowid()') as number;
			db.exec({ sql: 'INSERT INTO chunks_fts(rowid, text) VALUES (?, ?)', bind: [rowid, c.text] });
			const vec = embeddings.subarray(i * dims, (i + 1) * dims);
			db.exec({
				sql: 'INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)',
				bind: [rowid, new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength).slice()]
			});
		}
	});
}

/** Make arbitrary user input safe for FTS5 MATCH: quoted prefix tokens OR-free. */
function toFtsQuery(q: string): string {
	const tokens = q
		.split(/[^\p{L}\p{N}]+/u)
		.filter((t) => t.length > 1)
		.slice(0, 12);
	if (!tokens.length) return '""';
	return tokens.map((t) => `"${t.replaceAll('"', '')}"`).join(' OR ');
}

/** Hybrid search: FTS5 BM25 + vec0 KNN fused with RRF (k=60). */
function search(
	queryEmbedding: Float32Array,
	queryText: string,
	documentIds: string[] | null,
	topK = 8
): SearchHit[] {
	const vecBlob = new Uint8Array(
		queryEmbedding.buffer,
		queryEmbedding.byteOffset,
		queryEmbedding.byteLength
	).slice();
	const fts = toFtsQuery(queryText);
	// vec0 KNN cannot pre-filter by document: over-fetch and filter in the join.
	const rows = db.selectObjects(
		`WITH vec_matches AS (
			SELECT rowid AS id, ROW_NUMBER() OVER (ORDER BY distance) AS rank_n
			FROM chunks_vec WHERE embedding MATCH ? AND k = 40
		),
		fts_matches AS (
			SELECT rowid AS id, ROW_NUMBER() OVER (ORDER BY rank) AS rank_n
			FROM chunks_fts WHERE chunks_fts MATCH ? LIMIT 40
		),
		fused AS (
			SELECT COALESCE(v.id, f.id) AS id,
				COALESCE(1.0 / (60 + v.rank_n), 0) + COALESCE(1.0 / (60 + f.rank_n), 0) AS score
			FROM vec_matches v FULL OUTER JOIN fts_matches f ON v.id = f.id
		)
		SELECT c.id AS chunk_id, c.document_id, d.name AS document_name, c.text,
		       c.page, c.heading_path, fused.score
		FROM fused
		JOIN chunks c ON c.id = fused.id
		JOIN documents d ON d.id = c.document_id
		WHERE d.status = 'ready'
		ORDER BY fused.score DESC`,
		[vecBlob, fts]
	);
	const filtered = documentIds?.length
		? rows.filter((r: any) => documentIds.includes(r.document_id))
		: rows;
	return filtered.slice(0, topK).map((r: any) => ({
		chunkId: r.chunk_id,
		documentId: r.document_id,
		documentName: r.document_name,
		text: r.text,
		page: r.page,
		headingPath: r.heading_path,
		score: r.score
	}));
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

// ── Chats / messages / attachments ──────────────────────────────────────────

function rowToChat(r: any): LocalChat {
	return {
		id: r.id,
		title: r.title,
		mode: r.mode,
		privateOnly: !!r.private_only,
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

function touchChat(id: string): void {
	db.exec({ sql: 'UPDATE chats SET updated_at = ? WHERE id = ?', bind: [Date.now(), id] });
}

function deleteChat(id: string): void {
	db.exec({ sql: 'DELETE FROM chats WHERE id = ?', bind: [id] });
}

function insertMessage(m: {
	id: string;
	chatId: string;
	role: string;
	content: string;
	mode: string | null;
}): void {
	db.exec({
		sql: 'INSERT INTO messages(id, chat_id, role, content, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)',
		bind: [m.id, m.chatId, m.role, m.content, m.mode, Date.now()]
	});
}

function listMessages(chatId: string): LocalMessage[] {
	return db
		.selectObjects('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, rowid', [chatId])
		.map((r: any) => ({
			id: r.id,
			chatId: r.chat_id,
			role: r.role,
			content: r.content,
			mode: r.mode,
			createdAt: r.created_at
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

const api = {
	init,
	getDocumentByHash,
	listDocuments,
	insertDocument,
	setDocumentStatus,
	deleteDocument,
	insertChunks,
	search,
	countChunks,
	getChunk,
	getDocument,
	createChat,
	listChats,
	renameChat,
	setChatMode,
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
	insertPrivacyEvent,
	listPrivacyEvents,
	listChatPrivacyEvents
};

export type DbApi = typeof api;

expose(api);
