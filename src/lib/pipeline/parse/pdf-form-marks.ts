// Flattened PDF forms (France-Visas and similar generators) draw a checkbox as
// a symbol-font glyph — mapped by pdf.js into the Unicode private-use area —
// and the selected state as a second glyph overlaid at the same position (a
// dingbat letter rendering as a filled square). Plain text extraction keeps
// both as unreadable noise, so answers cannot tell which option is selected.
// This pass rewrites an overlaid pair to ☑ and, once a glyph codepoint has
// been seen checked anywhere in the document, its lone instances to ☐.
// A private-use glyph never seen checked stays untouched: it may be a bullet,
// and claiming "unchecked box" for it would invent form semantics.

export interface PositionedTextItem {
	text: string;
	x: number;
	y: number;
	width: number;
}

const STANDARD_BOXES = new Set(['☐', '□', '❏', '❐', '❑', '❒']);
const STANDARD_CHECKED = new Set(['☑', '☒', '✔', '✓']);
const OVERLAY_X_SLACK = 2;
const OVERLAY_Y_SLACK = 6;
const FALLBACK_BOX_WIDTH = 8;

function singleChar(item: PositionedTextItem): string | null {
	const trimmed = item.text.trim();
	const chars = [...trimmed];
	return chars.length === 1 ? chars[0] : null;
}

function isPrivateUse(char: string): boolean {
	const code = char.codePointAt(0) ?? 0;
	return code >= 0xe000 && code <= 0xf8ff;
}

function isBoxGlyph(char: string): boolean {
	return STANDARD_BOXES.has(char) || isPrivateUse(char);
}

/** Normalize checkbox glyphs across a whole document's positioned text items. */
export function normalizeFormMarks(pages: PositionedTextItem[][]): PositionedTextItem[][] {
	const checkedPuaCodes = new Set<number>();
	const analyzed = pages.map((items) => {
		const boxIndexes = new Set<number>();
		for (let index = 0; index < items.length; index++) {
			const char = singleChar(items[index]);
			if (char && isBoxGlyph(char)) boxIndexes.add(index);
		}
		// An overlay is a short non-box item sitting on a box glyph.
		const overlaidBoxes = new Set<number>();
		const consumedOverlays = new Set<number>();
		for (let index = 0; index < items.length; index++) {
			if (boxIndexes.has(index)) continue;
			const trimmed = items[index].text.trim();
			if (!trimmed || [...trimmed].length > 2) continue;
			if ([...trimmed].some((char) => isBoxGlyph(char))) continue;
			for (const boxIndex of boxIndexes) {
				const box = items[boxIndex];
				const boxWidth = box.width || FALLBACK_BOX_WIDTH;
				const withinX =
					items[index].x >= box.x - OVERLAY_X_SLACK &&
					items[index].x <= box.x + boxWidth + OVERLAY_X_SLACK;
				if (withinX && Math.abs(items[index].y - box.y) <= OVERLAY_Y_SLACK) {
					overlaidBoxes.add(boxIndex);
					consumedOverlays.add(index);
					break;
				}
			}
		}
		for (const boxIndex of overlaidBoxes) {
			const char = singleChar(items[boxIndex])!;
			if (isPrivateUse(char)) checkedPuaCodes.add(char.codePointAt(0)!);
		}
		return { items, boxIndexes, overlaidBoxes, consumedOverlays };
	});
	return analyzed.map(({ items, boxIndexes, overlaidBoxes, consumedOverlays }) =>
		items
			.map((item, index) => {
				const char = singleChar(item);
				if (char && boxIndexes.has(index)) {
					if (overlaidBoxes.has(index)) return { ...item, text: '☑' };
					if (STANDARD_BOXES.has(char)) return { ...item, text: '☐' };
					if (checkedPuaCodes.has(char.codePointAt(0)!)) return { ...item, text: '☐' };
					return item;
				}
				if (char && STANDARD_CHECKED.has(char)) return { ...item, text: '☑' };
				return item;
			})
			.filter((_, index) => !consumedOverlays.has(index))
	);
}
