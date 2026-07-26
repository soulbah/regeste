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
	/** Local retrieval-view version; old documents are repaired from OPFS. */
	retrievalVersion?: number;
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
	/** Retrieval-only structural context, e.g. repeated table headers. */
	retrievalContext?: string;
	/** Recognition confidence for OCR-originated text; absent for native text. */
	ocrConfidence?: number;
}

export interface ParsedDoc {
	blocks: ParsedBlock[];
	pages: number | null;
	/** 1-based page numbers with sparse or structurally unreliable text. */
	needsOcr?: number[];
	/** Suspicious native text retained only if full-page OCR cannot improve it. */
	ocrFallbackBlocks?: ParsedBlock[];
}

export interface Chunk {
	text: string;
	/** Retrieval-only representation enriched with document/section labels. */
	searchText: string;
	/** A table row's own columns, named ("Intérêts: 18,46 | …"). Null unless the
	 * row belongs to a table whose header was identified. Kept separate from
	 * `searchText` because exact analytics need the labels on their own, not
	 * blended with the document and section context. */
	structuralContext?: string | null;
	/** Retrieval-only character-gram representation. */
	fuzzyText?: string;
	seq: number;
	page: number | null;
	headingPath: string | null; // ' > '-joined
	paraIndex: number | null;
	charStart: number;
	charEnd: number;
	ocrConfidence?: number | null;
}

export interface SearchHit {
	chunkId: number;
	/** Structural parent that recalled this precise child, when expanded. */
	parentChunkId?: number;
	/** Document-local order, used only for bounded neighbor expansion. */
	seq?: number;
	/** -1 marks retrieval-only parent chunks; they must never enter prompts. */
	paraIndex?: number | null;
	documentId: string;
	documentName: string;
	text: string;
	/** This row's columns, named, when it came from a table with a header. */
	structuralContext?: string | null;
	page: number | null;
	headingPath: string | null;
	score: number;
	/** Raw component scores retained for calibration and honest refusals. */
	semanticScore?: number | null;
	lexicalScore?: number | null;
	fuzzyScore?: number | null;
	ocrConfidence?: number | null;
}

export type QuestionRoute = 'targeted' | 'synthesis' | 'aggregate';
export type MethodKind = QuestionRoute | 'clarification';

export interface MethodSummary {
	kind: MethodKind;
	documentCount: number;
	passageCount: number;
	reasoningUsed: boolean;
	/** Raw <think> trace of the pass that produced the answer — draft notes,
	 * shown collapsed in the method expander, never indexed for search. */
	reasoning?: string | null;
	/** Wall-clock of the generation that carried the reasoning. */
	reasoningMs?: number | null;
	calculation?: string | null;
	clarification?:
		| 'scope'
		| 'financial_role'
		| 'intent'
		| 'time'
		| 'entity'
		| 'document'
		| 'unit_currency'
		| 'multi_part'
		| null;
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
