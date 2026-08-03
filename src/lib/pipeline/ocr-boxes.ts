// Recognized text boxes, turned into the positioned items the page layout
// engine already understands.
//
// The recognizer detects one box per text region and returns it in original
// image coordinates, but the OCR path used to keep only the concatenated text.
// A scanned page therefore reached the chunker with strictly less structure
// than a born-digital one, where `pdf-layout.ts` has every glyph's position —
// which is why column interleaving and unbound table values survive on scans
// after the same bugs were fixed for native pages. The geometry was always
// there; it was dropped at the worker boundary.
//
// Two coordinate conventions meet here. Recognition works in image pixels with
// the origin top-left and y growing downward; pdf.js text items are in PDF
// points with the origin bottom-left, y growing upward, and `y` on the glyph
// baseline. Everything below converts the former into the latter so one
// reading-order implementation serves both kinds of page.

import type { PositionedPdfText } from './parse/pdf-layout';

export interface OcrBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface OcrItem {
	text: string;
	box: OcrBox;
}

/**
 * Padding the recognizer adds around every detected box.
 *
 * These are the library's own defaults, restated rather than relied upon: they
 * are passed back in explicitly at the call site, so a future default change
 * cannot silently desynchronise the box geometry from the un-padding below.
 *
 * Both are fractions of the box *height*, horizontal included — that is the
 * library's convention, not a transcription slip.
 */
export const OCR_PADDING_VERTICAL = 0.4;
export const OCR_PADDING_HORIZONTAL = 0.6;

/**
 * Recover the detected box from the padded one the recognizer returns.
 *
 * Padding exists so the recognizer sees whole glyphs including descenders and
 * accents, and shrinking it would cost accuracy on exactly the accented French
 * this pipeline is tuned for. So it stays, and the geometry is corrected here
 * instead.
 *
 * It cannot be skipped. Horizontal padding is 0.6 × height on each side, which
 * at 300 DPI is about 12 PDF points of inflation per side on ordinary body
 * text — wider than the minimum gutter `detectColumnGutters` looks for. Padded
 * boxes bridge every column separator on the page and the layout engine sees
 * one undifferentiated block.
 *
 * A box clamped against an image edge was padded by less than the formula, so
 * un-padding overshoots there; the result is clamped to stay inside the
 * original box rather than invert it.
 */
/**
 * The detected height a padded height came from.
 *
 * `padded = height + 2 · round(height · paddingVertical)` is not invertible by
 * dividing, because the rounding is applied to the true height and dividing
 * recovers a slightly larger one — enough to round the *horizontal* padding to
 * the wrong pixel, since both are derived from this same number. Detected
 * heights are whole pixels, so the exact one is found by testing the two or
 * three candidates around the estimate.
 */
function detectedHeight(paddedHeight: number, paddingVertical: number): number {
	const estimate = paddedHeight / (1 + 2 * paddingVertical);
	for (const candidate of [Math.round(estimate), Math.floor(estimate), Math.ceil(estimate)]) {
		if (candidate > 0 && candidate + 2 * Math.round(candidate * paddingVertical) === paddedHeight)
			return candidate;
	}
	// No exact solution: the box was clamped against an image edge, so it was
	// padded by less than the formula on that side.
	return estimate;
}

export function unpadOcrBox(
	box: OcrBox,
	paddingVertical = OCR_PADDING_VERTICAL,
	paddingHorizontal = OCR_PADDING_HORIZONTAL
): OcrBox {
	const height = detectedHeight(box.height, paddingVertical);
	// Rounded because the padding was: the recognizer adds whole pixels, and
	// both paddings are computed from the same height, so recovering that
	// height exactly recovers both.
	const vertical = Math.min(Math.round(height * paddingVertical), box.height / 2);
	const horizontal = Math.min(Math.round(height * paddingHorizontal), box.width / 2);
	return {
		x: box.x + horizontal,
		y: box.y + vertical,
		width: Math.max(1, box.width - 2 * horizontal),
		height: Math.max(1, box.height - 2 * vertical)
	};
}

export interface OcrGeometry {
	/** Rendered page height in pixels, for the y-axis flip. */
	imageHeight: number;
	/** Pixels per PDF point the page was rendered at. */
	scale: number;
	paddingVertical?: number;
	paddingHorizontal?: number;
}

/**
 * One page of recognized lines as positioned text in PDF points.
 *
 * The recognizer already groups items into lines and sorts each line
 * left-to-right, and that grouping is better than re-deriving one from box
 * tops: box height varies with font size on a single line, so the padded top
 * edges of a heading and its footnote marker differ by more than the layout
 * engine's line tolerance. Every item of a recognized line is therefore given
 * its line's median baseline, which makes the subsequent line clustering exact
 * instead of merely close.
 *
 * A line the recognizer merged across two columns is not a problem to fix here.
 * Those items genuinely sit at the same height, and splitting them is the
 * gutter detection's job — the same job it already does on native pages.
 */
export function positionedFromOcrLines(
	lines: OcrItem[][],
	geometry: OcrGeometry
): PositionedPdfText[] {
	const { imageHeight, scale } = geometry;
	if (!(scale > 0) || !(imageHeight > 0)) return [];
	const out: PositionedPdfText[] = [];
	for (const line of lines) {
		const boxes = line.map((item) =>
			unpadOcrBox(item.box, geometry.paddingVertical, geometry.paddingHorizontal)
		);
		const bottoms = boxes.map((box) => box.y + box.height).sort((left, right) => left - right);
		if (!bottoms.length) continue;
		const baseline = bottoms[Math.floor(bottoms.length / 2)];
		const y = (imageHeight - baseline) / scale;
		for (let index = 0; index < line.length; index++) {
			const text = line[index].text.trim();
			if (!text) continue;
			out.push({
				text,
				x: boxes[index].x / scale,
				y,
				width: boxes[index].width / scale
			});
		}
	}
	return out;
}

function coveredWidth(intervals: Array<[number, number]>): number {
	if (!intervals.length) return 0;
	const ordered = intervals
		.filter(([start, end]) => end > start)
		.sort((left, right) => left[0] - right[0]);
	if (!ordered.length) return 0;
	let total = 0;
	let [start, end] = ordered[0];
	for (const [nextStart, nextEnd] of ordered.slice(1)) {
		if (nextStart <= end) {
			end = Math.max(end, nextEnd);
			continue;
		}
		total += end - start;
		[start, end] = [nextStart, nextEnd];
	}
	return total + end - start;
}

/**
 * Overlay a sound PDF text layer on the OCR reading of the same page.
 *
 * Hybrid PDFs often paint a raster while keeping a few exact digital fields.
 * OCR is still needed for the rest of the page, but an OCR token occupying the
 * same rectangle as digital text must not be allowed to replace that exact
 * value. Matching is geometric only: no field names, language, or document
 * vocabulary. OCR-only regions stay untouched.
 *
 * A wide OCR region is removed only when native items cover at least half of
 * its width. This lets several native runs replace one merged OCR line while a
 * small native fragment cannot erase unrelated OCR text beside it.
 */
export function overlayNativePdfText(
	ocrItems: PositionedPdfText[],
	nativeItems: PositionedPdfText[],
	pageHeight: number
): PositionedPdfText[] {
	if (!nativeItems.length) return ocrItems;
	if (!ocrItems.length) return nativeItems;
	// PDF layout reconstruction itself uses a 2 pt line tolerance. Allow a small
	// OCR-baseline offset, but cap it below ordinary form line spacing so a value
	// can never erase the label printed directly above it.
	const baselineTolerance = Math.max(2, Math.min(4, pageHeight * 0.004));
	const keptOcr = ocrItems.filter((ocr) => {
		const start = ocr.x;
		const end = ocr.x + Math.max(ocr.width, 1);
		const overlaps = nativeItems
			.filter((native) => Math.abs(native.y - ocr.y) <= baselineTolerance)
			.map((native): [number, number] => [
				Math.max(start, native.x),
				Math.min(end, native.x + Math.max(native.width, 1))
			]);
		return coveredWidth(overlaps) / Math.max(end - start, 1) < 0.5;
	});
	return [...keptOcr, ...nativeItems];
}
