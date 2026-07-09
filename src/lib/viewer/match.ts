// Fuzzy passage matching for the PDF viewer. Chunk text was rebuilt from
// pdf.js text items with EOL/trim rewrites, so char offsets don't map back to
// items — instead we search the whitespace-normalized item stream and return
// the range of item indices covering the passage. Pure module (unit-tested).

function normalize(s: string): string {
	return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface MatchRange {
	/** Inclusive range of item indices covering the matched passage. */
	start: number;
	end: number;
}

/**
 * Find which items (in order) contain `needle`, whitespace/case-insensitive.
 * Long needles that don't match verbatim retry on a shortened prefix, so a
 * partially rewritten passage still highlights its beginning. Null on miss.
 */
export function findMatchRange(items: string[], needle: string): MatchRange | null {
	const target = normalize(needle);
	if (!target) return null;

	// Build the normalized haystack with a char → item-index map.
	let hay = '';
	const map: number[] = [];
	for (let i = 0; i < items.length; i++) {
		const norm = normalize(items[i]);
		if (!norm) continue;
		if (hay) {
			hay += ' ';
			map.push(i);
		}
		hay += norm;
		for (let c = 0; c < norm.length; c++) map.push(i);
	}
	if (!hay) return null;

	let idx = hay.indexOf(target);
	let matchLen = target.length;
	if (idx === -1 && target.length > 160) {
		// Retry on a prefix cut at a word boundary.
		let prefix = target.slice(0, 160);
		const lastSpace = prefix.lastIndexOf(' ');
		if (lastSpace > 80) prefix = prefix.slice(0, lastSpace);
		idx = hay.indexOf(prefix);
		matchLen = prefix.length;
	}
	if (idx === -1) return null;

	return { start: map[idx], end: map[idx + matchLen - 1] };
}
