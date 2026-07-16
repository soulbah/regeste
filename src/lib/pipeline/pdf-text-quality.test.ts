import { describe, expect, it } from 'vitest';
import type { ParsedDoc } from '$lib/types';
import { assessPdfTextLayer, mergeParsedWithOcr } from './pdf-text-quality';

describe('PDF text-layer quality', () => {
	it('routes dense joined-word text to full-page OCR', () => {
		const text = Array.from(
			{ length: 8 },
			() => 'LesGarantiesApplicablesRestentDécritesDansLesConditionsContractuelles'
		).join('\n');
		const quality = assessPdfTextLayer(text);
		expect(quality.reason).toBe('joined');
		expect(quality.longRunRatio).toBeGreaterThan(0.9);
	});

	it('keeps normal prose, identifiers and URLs on the native path', () => {
		const text = Array.from(
			{ length: 8 },
			(_, index) =>
				`Section ${index + 1}. Les garanties applicables restent décrites dans les conditions contractuelles. https://example.test/policy/${index}`
		).join('\n');
		expect(assessPdfTextLayer(text).reason).toBeNull();
	});

	it('does not treat CJK text as malformed because it has no spaces', () => {
		const text = '保険契約の補償内容と適用条件を確認してください'.repeat(8);
		expect(assessPdfTextLayer(text).reason).toBeNull();
	});

	it('routes sparse and repeatedly unmapped layers to OCR', () => {
		expect(assessPdfTextLayer('signature').reason).toBe('sparse');
		expect(
			assessPdfTextLayer(`Texte ${'lisible '.repeat(80)}\uFFFD\uFFFD\uFFFD\uFFFD`).reason
		).toBe('unmapped');
	});
});

describe('native/OCR page arbitration', () => {
	const parsed: ParsedDoc = {
		pages: 2,
		blocks: [{ text: 'Page native fiable', page: 1, charStart: 0, charEnd: 19 }],
		needsOcr: [2],
		ocrFallbackBlocks: [
			{
				text: 'TexteNatifDégradéSansSéparateursEntreLesMotsDeCetteLonguePhrase',
				page: 2,
				charStart: 0,
				charEnd: 64
			}
		]
	};

	it('selects readable, sufficiently confident OCR', () => {
		const merged = mergeParsedWithOcr(parsed, [
			{
				text: 'Texte OCR lisible avec des séparateurs entre les mots.',
				page: 2,
				charStart: 0,
				charEnd: 55,
				ocrConfidence: 0.91
			}
		]);
		expect(merged.map((block) => block.text)).toEqual([
			'Page native fiable',
			'Texte OCR lisible avec des séparateurs entre les mots.'
		]);
		expect(merged[1].ocrConfidence).toBe(0.91);
	});

	it('keeps degraded native text when OCR is empty and blocks exact analytics', () => {
		const merged = mergeParsedWithOcr(parsed, []);
		expect(merged[1].text).toContain('TexteNatifDégradé');
		expect(merged[1].ocrConfidence).toBe(0);
	});
});
