import { describe, expect, it } from 'vitest';
import { embeddingPhaseProgress, ingestReadiness } from './ingest-readiness';

describe('ingest readiness', () => {
	it('keeps preparing progress monotonic between model download and embedding', () => {
		expect(embeddingPhaseProgress('download', 1)).toBe(0.5);
		expect(embeddingPhaseProgress('embed', 0)).toBe(0.5);
		expect(embeddingPhaseProgress('embed', 0.5)).toBe(0.75);
	});

	it('blocks questions while the first attached document is still being read', () => {
		expect(ingestReadiness([{ status: 'ocr', phaseProgress: 0.5 }])).toMatchObject({
			blocking: true,
			preparingCount: 1,
			readyCount: 0,
			progress: 37.5,
			step: 2,
			status: 'ocr'
		});
	});

	it('allows questions against ready documents while another one is preparing', () => {
		expect(
			ingestReadiness([
				{ status: 'ready', phaseProgress: 1 },
				{ status: 'embedding', phaseProgress: 0.5 }
			])
		).toMatchObject({ blocking: false, preparingCount: 1, readyCount: 1, progress: 85 });
	});

	it('reports completion only when every usable document is ready', () => {
		expect(ingestReadiness([{ status: 'ready', phaseProgress: 1 }])).toEqual({
			blocking: false,
			preparingCount: 0,
			readyCount: 1,
			progress: 100,
			step: 4,
			status: 'ready'
		});
	});
});
