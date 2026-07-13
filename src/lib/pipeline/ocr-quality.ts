import type { SearchHit } from '$lib/types';

export const OCR_CONFIDENCE_FLOOR = 0.78;

/** Exactly one quality retry is allowed: attempt zero may retry, attempt one may not. */
export function shouldRetryOcr(confidence: number, attempt: number): boolean {
	return attempt === 0 && confidence < OCR_CONFIDENCE_FLOOR;
}

export function reliableForExactAnalytics(hit: Pick<SearchHit, 'ocrConfidence'>): boolean {
	return hit.ocrConfidence == null || hit.ocrConfidence >= OCR_CONFIDENCE_FLOOR;
}
