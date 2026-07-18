import { describe, expect, it } from 'vitest';
import { normalizeFormMarks, type PositionedTextItem } from './pdf-form-marks';

const item = (text: string, x: number, y: number, width = 8): PositionedTextItem => ({
	text,
	x,
	y,
	width
});

// Real geometry from a flattened France-Visas form: symbol-font boxes at
// U+F063, the tick drawn as a dingbat "n" overlaid on the selected box.
const BOX = '';

describe('normalizeFormMarks', () => {
	it('rewrites an overlaid box to ☑ and consumes the overlay glyph', () => {
		const page = [
			item(BOX, 66, 70),
			item('n', 68, 71, 6),
			item('Etablissement familial', 78, 70, 80),
			item(BOX, 172, 70),
			item('Etablissement privé/Visiteur', 184, 70, 90)
		];
		const [result] = normalizeFormMarks([page]);
		expect(result.map((entry) => entry.text)).toEqual([
			'☑',
			'Etablissement familial',
			'☐',
			'Etablissement privé/Visiteur'
		]);
	});

	it('qualifies lone instances of a checked codepoint across pages', () => {
		const checkedPage = [item(BOX, 66, 70), item('n', 68, 71, 6), item('Marié', 78, 70, 40)];
		const otherPage = [item(BOX, 66, 500), item('Célibataire', 78, 500, 40)];
		const [, result] = normalizeFormMarks([checkedPage, otherPage]);
		expect(result[0].text).toBe('☐');
	});

	it('leaves a private-use glyph alone when never seen checked', () => {
		const page = [item(BOX, 66, 70), item('Une puce décorative', 78, 70, 80)];
		const [result] = normalizeFormMarks([page]);
		expect(result[0].text).toBe(BOX);
	});

	it('does not bind a distant glyph as an overlay', () => {
		const page = [item(BOX, 66, 70), item('n', 120, 70, 6), item('Option', 130, 70, 40)];
		const [result] = normalizeFormMarks([page]);
		expect(result.map((entry) => entry.text)).toEqual([BOX, 'n', 'Option']);
	});

	it('normalizes standard unicode boxes and standalone check marks', () => {
		const page = [
			item('☐', 66, 70),
			item('Non retenu', 78, 70, 40),
			item('✔', 66, 50),
			item('Retenu', 78, 50, 40)
		];
		const [result] = normalizeFormMarks([page]);
		expect(result.map((entry) => entry.text)).toEqual(['☐', 'Non retenu', '☑', 'Retenu']);
	});
});
