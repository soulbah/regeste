import { describe, expect, it } from 'vitest';
import { OCR_CONFIDENCE_FLOOR, reliableForExactAnalytics, shouldRetryOcr } from './ocr-quality';

describe('OCR exact analytics gate', () => {
	it('keeps native/high-confidence text and rejects weak OCR', () => {
		expect(reliableForExactAnalytics({ ocrConfidence: null })).toBe(true);
		expect(reliableForExactAnalytics({ ocrConfidence: 0.94 })).toBe(true);
		expect(reliableForExactAnalytics({ ocrConfidence: 0.6 })).toBe(false);
	});

	it('bounds OCR quality retry to one extra attempt', () => {
		expect(shouldRetryOcr(OCR_CONFIDENCE_FLOOR - 0.01, 0)).toBe(true);
		expect(shouldRetryOcr(OCR_CONFIDENCE_FLOOR - 0.01, 1)).toBe(false);
		expect(shouldRetryOcr(OCR_CONFIDENCE_FLOOR, 0)).toBe(false);
	});
});
