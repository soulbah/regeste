import { describe, expect, it } from 'vitest';
import { orderPdfText, type PositionedPdfText } from './pdf-layout';

describe('PDF reading order', () => {
	it('reads a sustained two-column page down the left column then the right', () => {
		const items: PositionedPdfText[] = [];
		for (let line = 0; line < 10; line++) {
			items.push({ text: `L${line}`, x: 40, y: 700 - line * 20, width: 80 });
			items.push({ text: `R${line}`, x: 340, y: 700 - line * 20, width: 80 });
		}
		expect(orderPdfText(items, 600)).toEqual([
			...Array.from({ length: 10 }, (_, index) => `L${index}`),
			...Array.from({ length: 10 }, (_, index) => `R${index}`)
		]);
	});

	it('keeps a sparse label-value table in visual line order', () => {
		const items: PositionedPdfText[] = [];
		for (let line = 0; line < 5; line++) {
			items.push({ text: `Label${line}`, x: 40, y: 700 - line * 20, width: 80 });
			items.push({ text: `Value${line}`, x: 340, y: 700 - line * 20, width: 80 });
		}
		expect(orderPdfText(items, 600)).toEqual(
			Array.from({ length: 5 }, (_, index) => `Label${index} Value${index}`)
		);
	});
});
