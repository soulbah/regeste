export interface PositionedPdfText {
	text: string;
	x: number;
	y: number;
	width: number;
}

interface PdfLine {
	y: number;
	items: PositionedPdfText[];
}

function joinItems(items: PositionedPdfText[]): string {
	return items
		.sort((left, right) => left.x - right.x)
		.map((item) => item.text)
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Reconstruct reading order while avoiding the classic two-column
 * interleaving bug. A gutter is accepted only when it recurs at nearly the
 * same horizontal position on many lines; sparse tables remain line-ordered. */
export function orderPdfText(items: PositionedPdfText[], pageWidth: number): string[] {
	const lines: PdfLine[] = [];
	for (const item of items) {
		let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
		if (!line) {
			line = { y: item.y, items: [] };
			lines.push(line);
		}
		line.items.push(item);
	}
	lines.sort((left, right) => right.y - left.y);

	const minimumGap = Math.max(10, pageWidth * 0.02);
	const splitCandidates: number[] = [];
	for (const line of lines) {
		const sorted = [...line.items].sort((left, right) => left.x - right.x);
		let best: { gap: number; midpoint: number } | null = null;
		for (let index = 1; index < sorted.length; index++) {
			const gap = sorted[index].x - (sorted[index - 1].x + sorted[index - 1].width);
			const midpoint = sorted[index - 1].x + sorted[index - 1].width + gap / 2;
			if (gap < minimumGap || midpoint < pageWidth * 0.3 || midpoint > pageWidth * 0.7) continue;
			if (!best || Math.abs(midpoint - pageWidth / 2) < Math.abs(best.midpoint - pageWidth / 2))
				best = { gap, midpoint };
		}
		if (best) splitCandidates.push(best.midpoint);
	}

	const sortedCandidates = [...splitCandidates].sort((left, right) => left - right);
	const median = sortedCandidates[Math.floor(sortedCandidates.length / 2)];
	const consistent =
		median === undefined
			? []
			: splitCandidates.filter((candidate) => Math.abs(candidate - median) <= pageWidth * 0.08);
	const twoColumns = consistent.length >= Math.max(8, Math.ceil(lines.length * 0.2));
	if (!twoColumns) return lines.map((line) => joinItems([...line.items])).filter(Boolean);

	const gutter = [...consistent].sort((left, right) => left - right)[
		Math.floor(consistent.length / 2)
	];
	const left = lines
		.map((line) => joinItems(line.items.filter((item) => item.x < gutter)))
		.filter(Boolean);
	const right = lines
		.map((line) => joinItems(line.items.filter((item) => item.x >= gutter)))
		.filter(Boolean);
	return [...left, ...right];
}
