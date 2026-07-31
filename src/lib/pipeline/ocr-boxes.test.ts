import { describe, expect, it } from 'vitest';
import {
	OCR_PADDING_HORIZONTAL,
	OCR_PADDING_VERTICAL,
	positionedFromOcrLines,
	unpadOcrBox,
	type OcrBox,
	type OcrItem
} from './ocr-boxes';
import { orderPdfText } from './parse/pdf-layout';

/** `applyPaddingToRect` from ppu-paddle-ocr, restated so the un-padding is
 *  tested against the transform it actually has to invert rather than against
 *  its own arithmetic. Note both paddings scale with the box height. */
function padLikeRecognizer(
	box: OcrBox,
	imageWidth: number,
	imageHeight: number,
	paddingVertical = OCR_PADDING_VERTICAL,
	paddingHorizontal = OCR_PADDING_HORIZONTAL
): OcrBox {
	const vertical = Math.round(box.height * paddingVertical);
	const horizontal = Math.round(box.height * paddingHorizontal);
	const x = Math.max(0, box.x - horizontal);
	const y = Math.max(0, box.y - vertical);
	return {
		x,
		y,
		width: Math.min(imageWidth, box.x + box.width + horizontal) - x,
		height: Math.min(imageHeight, box.y + box.height + vertical) - y
	};
}

describe('OCR box un-padding', () => {
	it('recovers the detected box the recognizer padded', () => {
		// Several line heights, because the padding is a fraction of the height:
		// a heading and body text are padded by different amounts.
		for (const height of [24, 42, 60, 96]) {
			const detected = { x: 300, y: 900, width: 420, height };
			expect(unpadOcrBox(padLikeRecognizer(detected, 2480, 3508))).toEqual(detected);
		}
	});

	it('never inverts a box clamped against the image edge', () => {
		// A line starting at x=0 was padded by less than the formula, so the
		// inverse overshoots; it must still return a box inside the original.
		const clamped = unpadOcrBox({ x: 0, y: 0, width: 60, height: 40 });
		expect(clamped.x).toBeGreaterThanOrEqual(0);
		expect(clamped.width).toBeGreaterThan(0);
		expect(clamped.height).toBeGreaterThan(0);
		expect(clamped.x + clamped.width).toBeLessThanOrEqual(60);
	});
});

describe('recognized boxes as page positions', () => {
	const SCALE = 300 / 72;
	const IMAGE_HEIGHT = 3508;
	const IMAGE_WIDTH = 2480;

	/** One recognized line: items at a common height, boxes padded as the
	 *  recognizer returns them. */
	const line = (y: number, cells: { text: string; x: number; width: number }[]): OcrItem[] =>
		cells.map((cell) => ({
			text: cell.text,
			box: padLikeRecognizer(
				{ x: cell.x, y, width: cell.width, height: 42 },
				IMAGE_WIDTH,
				IMAGE_HEIGHT
			)
		}));

	it('flips the y axis and scales into PDF points', () => {
		const [item] = positionedFromOcrLines([line(1000, [{ text: 'Tarifs', x: 250, width: 300 }])], {
			imageHeight: IMAGE_HEIGHT,
			scale: SCALE
		});
		// Baseline sits at the un-padded box bottom, measured from the page top.
		expect(item.y).toBeCloseTo((IMAGE_HEIGHT - (1000 + 42)) / SCALE, 0);
		expect(item.x).toBeCloseTo(250 / SCALE, 0);
		expect(item.width).toBeCloseTo(300 / SCALE, 0);
	});

	it('gives every item of a recognized line one baseline', () => {
		// A heading and a footnote marker on the same line have different box
		// heights, so their padded tops differ by more than the layout engine's
		// 2pt line tolerance. They must still cluster as one line.
		const items = positionedFromOcrLines(
			[
				[
					{
						text: 'Garanties',
						box: padLikeRecognizer(
							{ x: 200, y: 1000, width: 300, height: 60 },
							IMAGE_WIDTH,
							IMAGE_HEIGHT
						)
					},
					{
						text: '(1)',
						box: padLikeRecognizer(
							{ x: 520, y: 1018, width: 40, height: 24 },
							IMAGE_WIDTH,
							IMAGE_HEIGHT
						)
					}
				]
			],
			{ imageHeight: IMAGE_HEIGHT, scale: SCALE }
		);
		expect(items).toHaveLength(2);
		expect(items[0].y).toBe(items[1].y);
	});

	it('keeps a two-column scan from interleaving, which padded boxes would not', () => {
		// Two columns 150 px apart: about 36 PDF points, a real gutter. Padded,
		// each box grows by 0.6 x 42 = 25 px per side and the two columns touch,
		// which is why the geometry cannot be used as returned.
		const lines = Array.from({ length: 12 }, (_, index) =>
			line(600 + index * 90, [
				{ text: `gauche${index}`, x: 200, width: 700 },
				{ text: `droite${index}`, x: 1050, width: 700 }
			])
		);
		const ordered = orderPdfText(
			positionedFromOcrLines(lines, { imageHeight: IMAGE_HEIGHT, scale: SCALE }),
			IMAGE_WIDTH / SCALE
		).map((entry) => entry.text);

		// Column-major: the whole left column, then the whole right column.
		const firstRight = ordered.findIndex((text) => text.startsWith('droite'));
		const lastLeft = ordered.map((text) => text.startsWith('gauche')).lastIndexOf(true);
		expect(firstRight).toBeGreaterThan(lastLeft);
		expect(ordered.filter((text) => text.startsWith('gauche'))).toHaveLength(12);

		// The same page read line by line, which is what the recognizer's own
		// concatenated text gives and what this path emitted before.
		const naive = lines.map((entries) => entries.map((entry) => entry.text).join(' '));
		expect(naive[0]).toBe('gauche0 droite0');
	});

	it('returns nothing rather than guessing when the page geometry is unusable', () => {
		expect(
			positionedFromOcrLines([line(100, [{ text: 'x', x: 0, width: 10 }])], {
				imageHeight: 0,
				scale: SCALE
			})
		).toEqual([]);
		expect(positionedFromOcrLines([], { imageHeight: 3508, scale: SCALE })).toEqual([]);
	});
});
