// Scanned-page detection from the page's drawing operators.
//
// `assessPdfTextLayer` judges a page by the text it yields, which cannot catch
// the common case of a scan that already carries a bad OCR layer: the text is
// plentiful, well-spaced and valid Unicode, and says nothing ("r--, I_ / 0 /
// 1..I-I"). Measured on the benchmark corpus, that blind spot covers 218 of the
// 305 pages whose text layer is unusable — we serve the junk as searchable text
// and never re-OCR.
//
// A page painted from one full-page raster IS a scan, whatever its text claims.
// That is structural, readable straight from the operator list, and needs no
// vocabulary. Paired with how much of the page the text actually covers it
// separates a scan whose OCR layer is worthless from a scan whose OCR layer is
// fine, without judging the language.

/** The pdf.js operator constants this module needs, passed in so the walker
 *  stays a pure function over data and can be unit-tested. The paint operators
 *  are optional because the set has changed across pdf.js majors (v6 dropped
 *  `paintJpegXObject`); an absent one simply never matches. */
export interface ScanOps {
	save: number;
	restore: number;
	transform: number;
	paintImageXObject?: number;
	paintJpegXObject?: number;
	paintImageXObjectRepeat?: number;
	paintInlineImageXObject?: number;
}

export interface OperatorList {
	fnArray: number[] | Int32Array;
	argsArray: unknown[];
}

export interface PositionedGlyphRun {
	width: number;
	height: number;
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: readonly number[]): Matrix {
	return [
		a[0] * b[0] + a[2] * b[1],
		a[1] * b[0] + a[3] * b[1],
		a[0] * b[2] + a[2] * b[3],
		a[1] * b[2] + a[3] * b[3],
		a[0] * b[4] + a[2] * b[5] + a[4],
		a[1] * b[4] + a[3] * b[5] + a[5]
	];
}

/** Fraction of the page covered by the largest single raster paint.
 *
 * An image is drawn by mapping the unit square through the current transform,
 * so the painted box is that matrix's column lengths. */
export function largestRasterCoverage(
	operatorList: OperatorList,
	ops: ScanOps,
	pageArea: number
): number {
	if (pageArea <= 0) return 0;
	const imageOps = new Set(
		[
			ops.paintImageXObject,
			ops.paintJpegXObject,
			ops.paintImageXObjectRepeat,
			ops.paintInlineImageXObject
		].filter((op): op is number => typeof op === 'number')
	);
	let current: Matrix = [...IDENTITY];
	const stack: Matrix[] = [];
	let largest = 0;
	for (let index = 0; index < operatorList.fnArray.length; index++) {
		const fn = operatorList.fnArray[index];
		if (fn === ops.save) {
			stack.push([...current]);
		} else if (fn === ops.restore) {
			current = stack.pop() ?? [...IDENTITY];
		} else if (fn === ops.transform) {
			const args = operatorList.argsArray[index];
			if (Array.isArray(args) && args.length >= 6) current = multiply(current, args);
		} else if (imageOps.has(fn)) {
			const width = Math.hypot(current[0], current[1]);
			const height = Math.hypot(current[2], current[3]);
			largest = Math.max(largest, (width * height) / pageArea);
		}
	}
	return largest;
}

/** Share of the page area the text layer's glyph boxes actually ink.
 *
 * A page of real text inks a fifth to a half of its area. A 1969 scan whose
 * embedded OCR produced a scattering of nonsense inks almost nothing, because
 * the recognizer emitted a few stray glyphs over a full-page photograph. */
export function textCoverage(runs: PositionedGlyphRun[], pageArea: number): number {
	if (pageArea <= 0) return 0;
	const inked = runs.reduce((sum, run) => sum + Math.abs(run.width) * Math.abs(run.height), 0);
	return Math.min(inked / pageArea, 1);
}

/** A page-dominating raster leaves little room for doubt; scanners commonly
 *  retain page margins, so requiring edge-to-edge paint misses ordinary bills
 *  and forms. Sparse text remains mandatory, which excludes illustrated pages
 *  whose digital text occupies the rest of the layout. */
const RASTER_COVERAGE = 0.8;
/** Below this the text layer is a scattering over a photograph, not a page of
 *  text. Measured separation on the corpus: real pages 0.17–0.49, junk 0.00–0.11. */
const USABLE_TEXT_COVERAGE = 0.08;

/**
 * Is this page a scan whose embedded text layer should not be trusted?
 *
 * Deliberately geometric. Whether the text *reads* as language is what the
 * benchmark's ground truth measures, so deciding on that here would make the
 * measurement circular; ink coverage is an independent signal.
 */
export function isUntrustedScan(rasterCoverage: number, coverage: number): boolean {
	return rasterCoverage >= RASTER_COVERAGE && coverage < USABLE_TEXT_COVERAGE;
}

/**
 * Cheap pre-check, so a page of ordinary text never pays for an operator list.
 *
 * `isUntrustedScan` needs thin text coverage as well as a full-page raster, and
 * coverage comes free with the text items while the raster measurement means
 * walking every drawing operator on the page. Asking the free question first
 * skips that walk on the overwhelming majority of pages.
 */
export function textLayerTooThin(coverage: number): boolean {
	return coverage < USABLE_TEXT_COVERAGE;
}
