// Shared types for the local pipeline. Everything here describes data that
// lives in the browser only — none of it may ever be sent to a server.

export type DocumentStatus =
	| 'received'
	| 'parsing'
	| 'chunking'
	| 'embedding'
	| 'ready'
	| 'scanned' // image-only pages are queued for an automatic on-device OCR pass
	| 'ocr' // OCR pass running
	| 'error';

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
	/** D2 — detected document language ('fr' | 'en'), null when undetected. */
	language: string | null;
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
	/** 1-based page numbers with no extractable text — image-only, OCR candidates (spec 023). */
	needsOcr?: number[];
}

export interface Chunk {
	text: string;
	/** Retrieval-only representation enriched with document/section labels. */
	searchText: string;
	seq: number;
	page: number | null;
	headingPath: string | null; // ' > '-joined
	paraIndex: number | null;
	charStart: number;
	charEnd: number;
}

export interface SearchHit {
	chunkId: number;
	/** Document-local order, used only for bounded neighbor expansion. */
	seq?: number;
	documentId: string;
	documentName: string;
	text: string;
	page: number | null;
	headingPath: string | null;
	score: number;
	/** Raw component scores retained for calibration and honest refusals. */
	semanticScore?: number | null;
	lexicalScore?: number | null;
}

export type QuestionRoute = 'targeted' | 'synthesis' | 'aggregate';

export interface MethodSummary {
	kind: QuestionRoute;
	documentCount: number;
	passageCount: number;
	reasoningUsed: boolean;
	calculation?: string | null;
}

export interface WorkStep {
	id: 'search' | 'inspect' | 'calculate' | 'write';
	status: 'pending' | 'active' | 'done';
	count?: number;
	elapsedMs?: number;
}

export type ChatMode = 'private' | 'assisted' | 'myai';

export interface LocalChat {
	id: string;
	title: string;
	mode: ChatMode;
	privateOnly: boolean;
	/** Model id for My AI mode, chosen in the mode selector (spec 007). */
	myaiModel: string | null;
	/** C6 — pinned chats group at the top of the sidebar. */
	pinned: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface LocalMessage {
	id: string;
	chatId: string;
	role: 'user' | 'assistant';
	content: string;
	/**
	 * 'retrieval' marks the transitional passages-only assistant turn (pre-004);
	 * 'notice' marks system messages (transport failures, aborted generations) —
	 * rendered distinctly from real answers.
	 */
	mode: ChatMode | 'retrieval' | 'notice' | null;
	createdAt: number;
	/** Spec 020 — versions of one turn share a group (the first answer's id). */
	versionGroup?: string | null;
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
