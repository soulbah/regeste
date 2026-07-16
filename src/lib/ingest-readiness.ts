import type { DocumentStatus } from '$lib/types';

export interface AttachedIngestState {
	status: DocumentStatus;
	phaseProgress: number;
}

export interface IngestReadiness {
	blocking: boolean;
	preparingCount: number;
	readyCount: number;
	progress: number;
	step: number;
	status: DocumentStatus | null;
}

export function embeddingPhaseProgress(phase: 'download' | 'embed', progress: number): number {
	const bounded = Math.min(1, Math.max(0, progress));
	return phase === 'download' ? bounded * 0.5 : 0.5 + bounded * 0.5;
}

const PHASE_START: Partial<Record<DocumentStatus, number>> = {
	received: 5,
	parsing: 15,
	scanned: 15,
	ocr: 15,
	chunking: 60,
	embedding: 70
};

function ingestPhaseStep(status: DocumentStatus): number {
	switch (status) {
		case 'received':
			return 1;
		case 'parsing':
		case 'scanned':
		case 'ocr':
			return 2;
		case 'chunking':
			return 3;
		case 'embedding':
			return 4;
		case 'ready':
			return 4;
		case 'error':
			return 1;
	}
}

function phaseProgress(item: AttachedIngestState): number {
	const start = PHASE_START[item.status] ?? 0;
	if (item.status === 'ocr') return start + Math.min(1, Math.max(0, item.phaseProgress)) * 45;
	if (item.status === 'embedding') return start + Math.min(1, Math.max(0, item.phaseProgress)) * 30;
	return start;
}

export function ingestReadiness(items: AttachedIngestState[]): IngestReadiness {
	const usable = items.filter((item) => item.status !== 'error');
	const preparing = usable.filter((item) => item.status !== 'ready');
	const readyCount = usable.length - preparing.length;
	const slowest = [...preparing].sort(
		(left, right) => phaseProgress(left) - phaseProgress(right)
	)[0];
	return {
		blocking: preparing.length > 0 && readyCount === 0,
		preparingCount: preparing.length,
		readyCount,
		progress: slowest ? phaseProgress(slowest) : readyCount ? 100 : 0,
		step: slowest ? ingestPhaseStep(slowest.status) : 4,
		status: slowest?.status ?? (readyCount ? 'ready' : null)
	};
}
