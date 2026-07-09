// Shared types for the local pipeline. Everything here describes data that
// lives in the browser only — none of it may ever be sent to a server.

export type DocumentStatus = 'received' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'error';

export type IngestErrorCode = 'scanned_pdf' | 'unsupported_format' | 'parse_failed' | 'unknown';

export interface LocalDocument {
	id: string;
	hash: string;
	name: string;
	mime: string;
	size: number;
	pages: number | null;
	status: DocumentStatus;
	error: IngestErrorCode | null;
	embeddingModel: string | null;
	createdAt: number;
	updatedAt: number;
}

/** A contiguous piece of source text with position metadata captured at parse time. */
export interface ParsedBlock {
	text: string;
	/** 1-based page number (PDF only). */
	page?: number;
	/** Heading breadcrumb, e.g. ["2. Obligations", "2.3 Notice"] (DOCX/MD). */
	headingPath?: string[];
	/** 0-based paragraph index within the document (DOCX/MD). */
	paraIndex?: number;
	/** Char offsets within the block's page (PDF) or the full document text (others). */
	charStart: number;
	charEnd: number;
}

export interface ParsedDoc {
	blocks: ParsedBlock[];
	pages: number | null;
}

export interface Chunk {
	text: string;
	seq: number;
	page: number | null;
	headingPath: string | null; // ' > '-joined
	paraIndex: number | null;
	charStart: number;
	charEnd: number;
}

export interface SearchHit {
	chunkId: number;
	documentId: string;
	documentName: string;
	text: string;
	page: number | null;
	headingPath: string | null;
	score: number;
}

export type ChatMode = 'private' | 'assisted' | 'myai';

export interface LocalChat {
	id: string;
	title: string;
	mode: ChatMode;
	privateOnly: boolean;
	/** Model id for My AI mode, chosen in the mode selector (spec 007). */
	myaiModel: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface LocalMessage {
	id: string;
	chatId: string;
	role: 'user' | 'assistant';
	content: string;
	/** 'retrieval' marks the transitional passages-only assistant turn (pre-004). */
	mode: ChatMode | 'retrieval' | null;
	createdAt: number;
}

export interface ChatDocument extends LocalDocument {
	enabled: boolean;
}

export interface LibraryDocument extends LocalDocument {
	chatCount: number;
}

export interface IngestProgress {
	status: DocumentStatus;
	/** 0..1 within the current phase (embedding reports real progress). */
	phaseProgress: number;
	error?: IngestErrorCode;
}
