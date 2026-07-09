// Right-panel document viewer state (spec 006). All entry points (citation
// chips, retrieval cards, document names) resolve through here so the panel
// has one source of truth. Resolution is local-only: chunk + document from
// the local DB, original bytes from OPFS — never the network.

import { getLocalDb } from '$lib/local-db/client';
import type { CitationRow } from '$lib/local-db/worker';
import type { LocalDocument, SearchHit } from '$lib/types';

export interface ViewerChunk {
	text: string;
	page: number | null;
	headingPath: string | null;
	charStart: number;
	charEnd: number;
}

export interface ViewerTarget {
	document: LocalDocument;
	/** Passage to highlight; null when browsing the document from its start. */
	chunk: ViewerChunk | null;
}

/** Citation snapshot shown when the chunk/document no longer exists locally. */
export interface ViewerSnapshot {
	documentName: string;
	locator: string | null;
	snippet: string;
}

class ViewerStore {
	target = $state<ViewerTarget | null>(null);
	snapshot = $state<ViewerSnapshot | null>(null);

	get isOpen(): boolean {
		return this.target !== null || this.snapshot !== null;
	}

	/** From a stored citation: resolve the chunk, else fall back to the snapshot. */
	async openCitation(citation: CitationRow): Promise<void> {
		const resolved = await this.resolve(citation.chunkId);
		if (resolved) return;
		this.target = null;
		this.snapshot = {
			documentName: citation.documentName,
			locator: citation.locator,
			snippet: citation.snippet
		};
	}

	/** From a retrieval hit (passage card): the chunk existed moments ago. */
	async openHit(hit: SearchHit): Promise<void> {
		const resolved = await this.resolve(hit.chunkId);
		if (resolved) return;
		this.target = null;
		this.snapshot = {
			documentName: hit.documentName,
			locator: hit.page ? `page ${hit.page}` : hit.headingPath,
			snippet: hit.text.slice(0, 240)
		};
	}

	/** From the Documents panel: open at the start, nothing highlighted. */
	openDocument(document: LocalDocument): void {
		this.snapshot = null;
		this.target = { document, chunk: null };
	}

	close(): void {
		this.target = null;
		this.snapshot = null;
	}

	private async resolve(chunkId: number | null): Promise<boolean> {
		if (chunkId == null) return false;
		const { db } = await getLocalDb();
		const chunk = await db.getChunk(chunkId);
		if (!chunk || chunk.document.status !== 'ready') return false;
		this.snapshot = null;
		this.target = {
			document: chunk.document,
			chunk: {
				text: chunk.text,
				page: chunk.page,
				headingPath: chunk.headingPath,
				charStart: chunk.charStart,
				charEnd: chunk.charEnd
			}
		};
		return true;
	}
}

export const viewerStore = new ViewerStore();
