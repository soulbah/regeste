// PP-DocLayout constants and the pure geometry shared by every caller.
//
// Spec 034. The detector replaces the hand-written layout model this codebase
// grew because its parser has none: a legal footer is the block the model puts
// in the footer band, not the block that contains company-law nouns. One
// forward pass per page (~0.5 s node, ~1.3 s browser wasm, measured), no
// decoder that can loop, no fp16 graph that can overflow.
//
// Conventions, fixed here so no caller re-derives them:
// - Region boxes are in PDF points, top-left origin. The worker renders at a
//   known scale and divides; pdf.js text items carry bottom-up y and are
//   flipped at the comparison site, never stored flipped.
// - Both detection settings are non-defaults and load-bearing, measured on the
//   owner's documents: the library's 0.5 threshold returns four regions on a
//   French letter and hides the footer entirely (0.15 returns twenty, footer at
//   0.95); any input size other than the model's native 800 returns nothing.

import type { PositionedPdfText } from './parse/pdf-layout';

/** Served through the /cdn proxy: media.githubusercontent.com is on its
 *  allow-list, and under cross-origin isolation a direct fetch would need CORP
 *  headers GitHub does not promise. V2 is the variant every number in spec 034
 *  was measured on; V3 (130 MB, masks) stays unmeasured. */
export const LAYOUT_MODEL_URL =
	'/cdn/media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/layout/PP-DocLayoutV2.onnx';
export const LAYOUT_THRESHOLD = 0.15;
export const LAYOUT_INPUT_SIZE = 800;
/** Cache API bucket for the model bytes, so 213 MB is fetched once per origin,
 *  not once per session. */
export const LAYOUT_CACHE = 'regeste-layout-model';

export interface LayoutRegion {
	label: string;
	score: number;
	/** [x0, y0, x1, y1] in PDF points, top-left origin. */
	box: [number, number, number, number];
}

/**
 * Region classes that are page chrome rather than content.
 *
 * Chrome is what must never glue to the body: the legal footer that swallowed
 * the signature block, the letterhead, the vertical filing reference in the
 * margin, the page number. `footnote` and `vision_footnote` are NOT here on
 * purpose — measured on the tariff corpus they carry the conditions the prices
 * refer to, which is content.
 */
export const CHROME_LABELS: ReadonlySet<string> = new Set([
	'header',
	'header_image',
	'footer',
	'footer_image',
	'aside_text',
	'number'
]);

/** Bottom share of the page that counts as the footer band for the routing
 *  signal (not for tagging — tagging uses the model's own boxes). */
const FOOTER_BAND = 0.14;
/** A legal footer is a paragraph; a page number is not. The signal must fire on
 *  the first and stay quiet on the second, or every page of a long report pays
 *  a detector pass for its page numbers. */
const FOOTER_BAND_MIN_CHARS = 120;
/** An amount, as a token shape (see .claude/rules/nlp.md: shapes stay). */
const AMOUNT_SHAPE = /\d[\d\s.,]*\s*(?:€|%)|\b(?:gratuit|offert|n[ée]ant)\b/iu;
const AMOUNT_MIN_COUNT = 4;

/**
 * Should this born-digital page pay for a detector pass?
 *
 * Scanned pages get regions for free (the bitmap already exists for
 * recognition); born-digital pages rasterise only when one of these fires.
 * Both signals are cheap reads of the positioned items the parser already
 * holds, and both mark the page families the hand-written heuristics get
 * wrong: letters whose legal footer glues into the body, and tariff pages.
 */
export function layoutUncertain(items: PositionedPdfText[], pageHeight: number): boolean {
	if (!items.length) return false;
	let footerBandChars = 0;
	let amounts = 0;
	for (const item of items) {
		// pdf.js y is bottom-up: the footer band is the smallest y values.
		if (item.y <= pageHeight * FOOTER_BAND) footerBandChars += item.text.length;
		if (AMOUNT_SHAPE.test(item.text)) amounts++;
	}
	return footerBandChars >= FOOTER_BAND_MIN_CHARS || amounts >= AMOUNT_MIN_COUNT;
}

export interface ChromeSplit {
	body: PositionedPdfText[];
	/** One group per chrome region, in top-down page order, each carrying the
	 *  region's label. */
	chrome: Array<{ label: string; items: PositionedPdfText[] }>;
}

/**
 * Confidence floor for treating a region as chrome.
 *
 * The global 0.15 threshold exists so routing and table hints can SEE every
 * region; moving text out of the body is a stronger act and demands a stronger
 * belief. Measured spread: real chrome on the attestation scores 0.73–0.95,
 * the junk on the dot-leader tariff page scores 0.17–0.25 (a mid-column
 * "header", prices read as page numbers). 0.5 separates them with margin on
 * both sides.
 */
const CHROME_SCORE_FLOOR = 0.5;

/** Vertical bands (as a share of page height) where header- and footer-class
 *  chrome may live, and the horizontal margin share for aside text. */
const HEADER_BAND = 0.18;
const FOOTER_BAND_LIMIT = 0.18;
const ASIDE_MARGIN = 0.1;

/**
 * A chrome-classed region only counts as chrome where chrome lives.
 *
 * Measured reason, not caution: on a dot-leader tariff page the detector
 * returned three `number` regions in the middle of the page — prices read as
 * page numbers — and moving them out of the body handed the label
 * "convention séquestre" the wrong neighbour. A page number sits in the top or
 * bottom band; a footer sits at the bottom; an aside hugs a margin. A
 * chrome-classed box in the body is a misdetection and stays body.
 */
function inChromeBand(region: LayoutRegion, pageWidth: number, pageHeight: number): boolean {
	const [x0, y0, x1, y1] = region.box;
	const centerY = (y0 + y1) / 2;
	const centerX = (x0 + x1) / 2;
	switch (region.label) {
		case 'header':
		case 'header_image':
			return centerY <= pageHeight * HEADER_BAND;
		case 'footer':
		case 'footer_image':
			return centerY >= pageHeight * (1 - FOOTER_BAND_LIMIT);
		case 'number':
			return centerY <= pageHeight * HEADER_BAND || centerY >= pageHeight * (1 - FOOTER_BAND_LIMIT);
		case 'aside_text':
			return centerX <= pageWidth * ASIDE_MARGIN || centerX >= pageWidth * (1 - ASIDE_MARGIN);
		default:
			return false;
	}
}

/** Tolerance around a region box, in points: detector boxes hug the ink and a
 *  glyph's baseline can sit a point outside. */
const REGION_PAD = 3;
/** Same y tolerance as the line reconstruction: items this close share a line. */
const CHROME_LINE_TOLERANCE = 3;
/** A line follows a chrome region only when most of its ink sits inside. */
const CHROME_LINE_MAJORITY = 0.7;

/**
 * Split a page's items into body and chrome by the detector's own boxes.
 *
 * The split happens BEFORE `orderPdfText`, which is the whole trick: items
 * still carry x/y here, the reconstructed lines do not, and ordering body and
 * chrome separately cannot interleave them — the defect where the balance
 * sentence of a letter reads after the legal footer becomes unrepresentable.
 *
 * Two guards, both put here by a measured regression on one A5 tariff flyer
 * ("Nous consulter" severed from the dot-leader label it prices):
 *
 * - The score floor. The global 0.15 threshold exists so routing and table
 *   hints can SEE every region; moving text out of the body is a stronger act
 *   and demands a stronger belief. Real chrome on the attestation scores
 *   0.73–0.95; the junk on the flyer (a 45-point-wide "header" sitting exactly
 *   on a price) scores 0.17–0.25. 0.5 separates them with margin.
 * - Per-line assignment. Items are clustered by y first and a whole line
 *   follows a region only when ≥70% of its width sits inside, so a region edge
 *   can never bisect a line and orphan a value from its label.
 */
export function splitByChrome(
	items: PositionedPdfText[],
	regions: LayoutRegion[],
	pageWidth: number,
	pageHeight: number
): ChromeSplit {
	const chromeRegions = regions
		.filter(
			(region) =>
				CHROME_LABELS.has(region.label) &&
				region.score >= CHROME_SCORE_FLOOR &&
				inChromeBand(region, pageWidth, pageHeight)
		)
		.sort((a, b) => a.box[1] - b.box[1]);
	if (!chromeRegions.length) return { body: items, chrome: [] };

	// Cluster into lines exactly the way orderPdfText will.
	const lines: Array<{ y: number; items: PositionedPdfText[] }> = [];
	for (const item of items) {
		const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= CHROME_LINE_TOLERANCE);
		if (line) line.items.push(item);
		else lines.push({ y: item.y, items: [item] });
	}

	const inkWidth = (item: PositionedPdfText) => Math.max(item.width, 1);
	const insideRegion = (item: PositionedPdfText, region: LayoutRegion) => {
		const topDownY = pageHeight - item.y;
		const centerX = item.x + item.width / 2;
		return (
			centerX >= region.box[0] - REGION_PAD &&
			centerX <= region.box[2] + REGION_PAD &&
			topDownY >= region.box[1] - REGION_PAD &&
			topDownY <= region.box[3] + REGION_PAD
		);
	};

	const body: PositionedPdfText[] = [];
	const buckets = chromeRegions.map((region) => ({
		label: region.label,
		items: [] as PositionedPdfText[]
	}));
	for (const line of lines) {
		const total = line.items.reduce((sum, item) => sum + inkWidth(item), 0);
		const captured = chromeRegions.findIndex(
			(region) =>
				line.items
					.filter((item) => insideRegion(item, region))
					.reduce((sum, item) => sum + inkWidth(item), 0) /
					total >=
				CHROME_LINE_MAJORITY
		);
		if (captured === -1) body.push(...line.items);
		else buckets[captured].items.push(...line.items);
	}
	return { body, chrome: buckets.filter((bucket) => bucket.items.length) };
}

/** Detector output in image pixels → PDF points, top-left origin. The render
 *  is top-down already, so only the scale divides. */
export function regionsFromImage(
	boxes: Array<{ label: string; score: number; box: number[] }>,
	scale: number
): LayoutRegion[] {
	return boxes.map((entry) => ({
		label: entry.label,
		score: entry.score,
		box: [
			entry.box[0] / scale,
			entry.box[1] / scale,
			entry.box[2] / scale,
			entry.box[3] / scale
		] as [number, number, number, number]
	}));
}
