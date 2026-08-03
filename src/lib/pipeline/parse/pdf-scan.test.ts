import { describe, expect, it } from 'vitest';
import {
	isUntrustedScan,
	largestRasterCoverage,
	textCoverage,
	type OperatorList,
	type ScanOps
} from './pdf-scan';

// Codes are arbitrary; pdf.js passes its own OPS table in.
const OPS = {
	save: 1,
	restore: 2,
	transform: 3,
	paintImageXObject: 4,
	paintImageXObjectRepeat: 5,
	paintInlineImageXObject: 6
} satisfies ScanOps;

const A4 = 595 * 842;

function ops(entries: Array<[number, unknown]>): OperatorList {
	return { fnArray: entries.map(([fn]) => fn), argsArray: entries.map(([, args]) => args) };
}

describe('largestRasterCoverage', () => {
	it('measures a full-page scan raster', () => {
		const list = ops([
			[OPS.save, null],
			[OPS.transform, [595, 0, 0, 842, 0, 0]],
			[OPS.paintImageXObject, ['img_0']],
			[OPS.restore, null]
		]);
		expect(largestRasterCoverage(list, OPS, A4)).toBeCloseTo(1, 5);
	});

	it('restores the transform so a later inline figure is measured on its own', () => {
		// Without honouring save/restore the second paint would inherit the
		// full-page matrix and every illustrated page would look like a scan.
		const list = ops([
			[OPS.save, null],
			[OPS.transform, [595, 0, 0, 842, 0, 0]],
			[OPS.restore, null],
			[OPS.paintImageXObject, ['logo']]
		]);
		expect(largestRasterCoverage(list, OPS, A4)).toBeCloseTo(1 / A4, 8);
	});

	it('composes nested transforms', () => {
		const list = ops([
			[OPS.transform, [595, 0, 0, 842, 0, 0]],
			[OPS.transform, [0.5, 0, 0, 0.5, 0, 0]],
			[OPS.paintImageXObject, ['half']]
		]);
		expect(largestRasterCoverage(list, OPS, A4)).toBeCloseTo(0.25, 5);
	});

	it('ignores an operator the running pdf.js build does not define', () => {
		// v6 dropped paintJpegXObject; an absent code must never match op 0.
		const list = ops([[0, null]]);
		expect(largestRasterCoverage(list, { ...OPS, paintJpegXObject: undefined }, A4)).toBe(0);
	});
});

describe('textCoverage', () => {
	it('is near zero for a scattering of glyphs over a page', () => {
		expect(
			textCoverage(
				Array.from({ length: 20 }, () => ({ width: 6, height: 8 })),
				A4
			)
		).toBeLessThan(0.01);
	});

	it('clamps to 1 when glyph boxes overlap past the page area', () => {
		expect(textCoverage([{ width: 2000, height: 2000 }], A4)).toBe(1);
	});
});

describe('isUntrustedScan', () => {
	it('flags a full-page raster whose text layer inks almost nothing', () => {
		// The 1969 NASA scans: plenty of valid characters, none of them meaning
		// anything, over a photograph. assessPdfTextLayer accepts that text.
		expect(isUntrustedScan(1, 0.02)).toBe(true);
	});

	it('flags a page-dominating scan that retains ordinary document margins', () => {
		expect(isUntrustedScan(0.84, 0.023)).toBe(true);
	});

	it('spares a scan whose OCR layer actually covers the page', () => {
		expect(isUntrustedScan(1, 0.2)).toBe(false);
	});

	it('spares a born-digital page with a full-width hero image', () => {
		expect(isUntrustedScan(0.55, 0.01)).toBe(false);
	});
});
