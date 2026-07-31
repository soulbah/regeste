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

/** A word run must be at least this long to highlight on its own; shorter runs
 * ("de", "TTC", a bare number) match all over a page and would paint noise. */
const MIN_SEGMENT_CHARS = 12;
/** Below this share of the passage found, the highlight would lie by omission —
 * better to show none than two words of a sentence that is really elsewhere. */
const MIN_COVERAGE = 0.5;

/**
 * Find the items covering `needle`, allowing the passage to be split across
 * the page in several places.
 *
 * A table row is one line of chunk text but its cells are separate items,
 * often far apart in the content stream — the label early, the amount late.
 * The contiguous search above cannot see that; this walks the passage word by
 * word, greedily matching the longest run the item stream contains, and
 * returns one range per run. Contiguous passages still return a single range
 * (the fast path is tried first), so callers render both cases the same way.
 */
export function findMatchRanges(items: string[], needle: string): MatchRange[] {
	const whole = findMatchRange(items, needle);
	if (whole) return [whole];

	const target = normalize(needle);
	if (!target) return [];

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
	if (!hay) return [];

	const words = target.split(' ');
	const ranges: MatchRange[] = [];
	let covered = 0;
	let index = 0;
	while (index < words.length) {
		// Longest run of consecutive words present as one substring, greedily.
		let run = '';
		let end = index;
		for (let probe = index; probe < words.length; probe++) {
			const candidate = run ? `${run} ${words[probe]}` : words[probe];
			if (!hay.includes(candidate)) break;
			run = candidate;
			end = probe + 1;
		}
		if (run.length >= MIN_SEGMENT_CHARS) {
			const at = hay.indexOf(run);
			ranges.push({ start: map[at], end: map[at + run.length - 1] });
			covered += run.length;
			index = end;
		} else {
			index++;
		}
	}
	if (covered / target.length < MIN_COVERAGE) return [];
	// Merge ranges that touch the same items so the caller paints each item once.
	ranges.sort((a, b) => a.start - b.start);
	const merged: MatchRange[] = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
		else merged.push({ ...range });
	}
	return merged;
}
