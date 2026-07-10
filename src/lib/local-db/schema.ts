// Versioned migrations for the LOCAL browser database (OPFS). Applied in order
// by the db worker; the current version lives in the meta table. Append-only:
// never edit an entry that has shipped — add a new one.
//
// Privacy invariant: this schema exists in the user's browser only. It is the
// ONLY place where documents, chats, chunks and embeddings are ever stored.

export const EMBEDDING_DIMS = 384;

export const MIGRATIONS: string[] = [
	// v1 — initial schema
	`
	CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

	CREATE TABLE documents (
		id TEXT PRIMARY KEY,
		hash TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL,
		mime TEXT NOT NULL,
		size INTEGER NOT NULL,
		pages INTEGER,
		status TEXT NOT NULL DEFAULT 'received',
		error TEXT,
		embedding_model TEXT,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE document_versions (
		id TEXT PRIMARY KEY,
		document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
		hash TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE chats (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		mode TEXT NOT NULL DEFAULT 'private',
		private_only INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE messages (
		id TEXT PRIMARY KEY,
		chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
		role TEXT NOT NULL,
		content TEXT NOT NULL,
		mode TEXT,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE chat_documents (
		chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
		document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
		enabled INTEGER NOT NULL DEFAULT 1,
		added_at INTEGER NOT NULL,
		PRIMARY KEY (chat_id, document_id)
	);

	CREATE TABLE chunks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
		seq INTEGER NOT NULL,
		text TEXT NOT NULL,
		page INTEGER,
		heading_path TEXT,
		para_index INTEGER,
		char_start INTEGER NOT NULL,
		char_end INTEGER NOT NULL
	);
	CREATE INDEX idx_chunks_document ON chunks(document_id);

	CREATE VIRTUAL TABLE chunks_fts USING fts5(text, content='chunks', content_rowid='id');

	CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding float[${EMBEDDING_DIMS}]);

	CREATE TABLE citations (
		id TEXT PRIMARY KEY,
		message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
		chunk_id INTEGER,
		snippet TEXT NOT NULL,
		document_name TEXT NOT NULL,
		locator TEXT,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE privacy_events (
		id TEXT PRIMARY KEY,
		chat_id TEXT,
		message_id TEXT,
		mode TEXT NOT NULL,
		destination TEXT NOT NULL,
		excerpt_count INTEGER NOT NULL DEFAULT 0,
		bytes_sent INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);
	`,

	// v2 — My AI: per-chat model (spec 007)
	`
	ALTER TABLE chats ADD COLUMN myai_model TEXT;
	`,

	// v3 — universal search: message content in FTS5 (spec 008).
	// Retrieval-preview turns store JSON, not prose — excluded here and at insert time.
	`
	CREATE VIRTUAL TABLE messages_fts USING fts5(content, content='messages', content_rowid='rowid');
	INSERT INTO messages_fts(rowid, content)
		SELECT rowid, content FROM messages WHERE mode IS NULL OR mode != 'retrieval';
	`,

	// v4 — repair + resync FTS indexes. Early builds issued FTS5 'delete'
	// commands with dummy content, which corrupts an external-content index
	// (SQLITE_CORRUPT_VTAB on the next MATCH). 'rebuild' regenerates both
	// indexes from their content tables; external-content FTS must mirror the
	// content table 1:1, so retrieval-preview rows are indexed too and filtered
	// at query time instead of insert time.
	`
	INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');
	INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
	`,

	// v5 — pinned chats (spec 010, C6)
	`
	ALTER TABLE chats ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
	`,

	// v6 — document language (spec 011, D2)
	`
	ALTER TABLE documents ADD COLUMN language TEXT;
	`,

	// v7 — What AI saw (spec 012): per-answer passage snapshots with sent state.
	// sent: 1 = left the device, 0 = stayed (private mode or user-excluded).
	`
	CREATE TABLE message_excerpts (
		id TEXT PRIMARY KEY,
		message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
		chunk_id INTEGER,
		sent INTEGER NOT NULL DEFAULT 0,
		excluded INTEGER NOT NULL DEFAULT 0,
		snippet TEXT NOT NULL,
		document_name TEXT NOT NULL,
		locator TEXT,
		created_at INTEGER NOT NULL
	);
	CREATE INDEX idx_message_excerpts_message ON message_excerpts(message_id);
	`,

	// v8 — answer versions (spec 020): Try again keeps the previous answer.
	// version_group ties versions of one turn together (the first message's id);
	// active marks the displayed one. Existing rows are all active singletons.
	`
	ALTER TABLE messages ADD COLUMN version_group TEXT;
	ALTER TABLE messages ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
	CREATE INDEX idx_messages_version_group ON messages(version_group);
	`
];
