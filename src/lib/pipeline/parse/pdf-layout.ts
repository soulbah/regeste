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

/** Recurring vertical gutters shared by many lines (recursive XY-cut's
 * projection step): x-bands that almost no line's ink covers, with occupied
 * zones on both sides. Three-plus-column tables produce two or more. */
function detectColumnGutters(lines: PdfLine[], pageWidth: number): number[] {
	const step = 2;
	const bands = Math.ceil(pageWidth / step);
	const occupancy = new Array<number>(bands).fill(0);
	let contentLines = 0;
	for (const line of lines) {
		if (!line.items.length) continue;
		contentLines++;
		const covered = new Set<number>();
		for (const item of line.items) {
			const start = Math.max(0, Math.floor(item.x / step));
			const end = Math.min(bands - 1, Math.ceil((item.x + Math.max(item.width, 1)) / step));
			for (let band = start; band <= end; band++) covered.add(band);
		}
		for (const band of covered) occupancy[band]++;
	}
	const minimumGap = Math.max(10, pageWidth * 0.02);
	const lowOccupancy = Math.max(1, Math.ceil(contentLines * 0.12));
	const denseOccupancy = Math.ceil(contentLines * 0.3);
	const gutters: number[] = [];
	let runStart = -1;
	for (let band = 0; band <= bands; band++) {
		const low = band < bands && occupancy[band] <= lowOccupancy;
		if (low && runStart < 0) runStart = band;
		if (!low && runStart >= 0) {
			const runWidth = (band - runStart) * step;
			const denseLeft = occupancy.slice(0, runStart).some((count) => count >= denseOccupancy);
			const denseRight = occupancy.slice(band).some((count) => count >= denseOccupancy);
			// A gutter is a narrow recurring gap: a wide low-ink span is just a
			// sparse area (an almost-empty column), not a column separator.
			if (runWidth >= minimumGap && runWidth <= pageWidth * 0.12 && denseLeft && denseRight)
				gutters.push(((runStart + band) / 2) * step);
			runStart = -1;
		}
	}
	return gutters;
}

function columnOf(item: PositionedPdfText, gutters: number[]): number {
	let column = 0;
	for (const gutter of gutters) if (item.x >= gutter) column++;
	return column;
}

/** Emit a multi-column table page region by region: full-width lines separate
 * regions, and inside a columnar region cells are emitted column-major so a
 * multi-line cell stays contiguous instead of interleaving with its neighbors. */
function emitColumnRegions(lines: PdfLine[], gutters: number[]): string[] {
	const crossesGutter = (line: PdfLine) =>
		line.items.some((item) =>
			gutters.some((gutter) => item.x < gutter && item.x + Math.max(item.width, 1) > gutter)
		);
	const out: string[] = [];
	let region: PdfLine[] = [];
	// A data-table row is a self-contained record: two or more columns whose
	// every cell is a bare value (number, amount, date). An amortization
	// schedule is made of them; a fact-sheet table (checkbox grids, IPID-style
	// prose cells that wrap over several lines) has none. Data rows must be
	// emitted row-major — column-major shears the record apart and re-titles a
	// lone column with the full table header, which is how "capital restant dû
	// 1 765,44" got answered as the first installment.
	const isValueCell = (cell: string) => /^[\d\s.,/€%'-]+$/.test(cell) && /\d/.test(cell);
	const isDataRow = (line: PdfLine) => {
		const columns = [...new Set(line.items.map((item) => columnOf(item, gutters)))];
		if (columns.length < 2) return false;
		return columns.every((column) =>
			isValueCell(joinItems(line.items.filter((item) => columnOf(item, gutters) === column)))
		);
	};
	const flush = () => {
		if (!region.length) return;
		const multiColumnLines = region.filter(
			(line) => new Set(line.items.map((item) => columnOf(item, gutters))).size >= 2
		).length;
		// A genuine table populates every detected column; phantom gutters inside
		// justified prose leave some "columns" nearly empty.
		const populationFloor = Math.max(2, Math.ceil(region.length * 0.25));
		const everyColumnPopulated = Array.from({ length: gutters.length + 1 }, (_, column) =>
			region.filter((line) => line.items.some((item) => columnOf(item, gutters) === column))
		).every((linesInColumn) => linesInColumn.length >= populationFloor);
		const dataRows = region.filter(isDataRow).length;
		if (region.length >= 3 && dataRows >= Math.max(3, Math.ceil(region.length * 0.5))) {
			// Row-major: each record stays one line, headers keep their own line.
			for (const line of region) {
				const text = joinItems([...line.items]);
				if (text) out.push(text);
			}
		} else if (
			region.length >= 3 &&
			multiColumnLines >= Math.ceil(region.length * 0.3) &&
			everyColumnPopulated
		) {
			for (let column = 0; column <= gutters.length; column++) {
				for (const line of region) {
					const cell = joinItems(line.items.filter((item) => columnOf(item, gutters) === column));
					if (cell) out.push(cell);
				}
			}
		} else {
			for (const line of region) {
				const text = joinItems([...line.items]);
				if (text) out.push(text);
			}
		}
		region = [];
	};
	for (const line of lines) {
		if (crossesGutter(line)) {
			flush();
			const text = joinItems([...line.items]);
			if (text) out.push(text);
		} else {
			region.push(line);
		}
	}
	flush();
	return out;
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

	// Three-plus-column tables (two or more recurring gutters) interleave cells
	// when read line by line; single-gutter article layouts keep the dedicated
	// two-column path below. Gutters are computed per horizontal region — the
	// recursive step of XY-cut — because full-width prose elsewhere on the page
	// would otherwise mask a table's column structure.
	// A region separator is a full-width line with no internal hole: prose and
	// titles have only word-sized gaps, while a table row spanning the page
	// always carries a column-sized hole between its cells.
	const isRegionSeparator = (line: PdfLine) => {
		const sorted = [...line.items].sort((left, right) => left.x - right.x);
		const start = sorted[0].x;
		const end = Math.max(...sorted.map((item) => item.x + Math.max(item.width, 1)));
		if (end - start < pageWidth * 0.6) return false;
		let largestHole = 0;
		for (let index = 1; index < sorted.length; index++) {
			const hole = sorted[index].x - (sorted[index - 1].x + sorted[index - 1].width);
			if (hole > largestHole) largestHole = hole;
		}
		return largestHole <= Math.max(12, pageWidth * 0.025);
	};
	const regions: PdfLine[][] = [];
	let current: PdfLine[] = [];
	for (const line of lines) {
		if (isRegionSeparator(line)) {
			if (current.length) regions.push(current);
			regions.push([line]);
			current = [];
		} else {
			current.push(line);
		}
	}
	if (current.length) regions.push(current);
	const regionGutters = regions.map((regionLines) =>
		regionLines.length >= 3 ? detectColumnGutters(regionLines, pageWidth) : []
	);
	if (regionGutters.some((gutters) => gutters.length >= 2)) {
		// Recursive XY-cut: a region without table structure still gets the
		// single-gutter article treatment — never plain interleaved lines.
		return regions.flatMap((regionLines, index) =>
			regionGutters[index].length >= 2
				? emitColumnRegions(regionLines, regionGutters[index])
				: orderLinesWithSingleGutter(regionLines, pageWidth)
		);
	}

	return orderLinesWithSingleGutter(lines, pageWidth);
}

/** Original single-gutter path: split left/right only when a central gutter
 * recurs at nearly the same position on many lines; otherwise line order. */
function orderLinesWithSingleGutter(lines: PdfLine[], pageWidth: number): string[] {
	// Data-table guard, same reasoning as in emitColumnRegions: a page whose
	// lines are rows of three-plus bare values (numbers, amounts, dates) is a
	// schedule, and the two-column article split would shear every record in
	// half — dates left, installments right (measured: an amortization page
	// answered "the first installment" with an outstanding balance).
	const isValueItem = (text: string) => /^[\d\s.,/€%'-]+$/.test(text) && /\d/.test(text);
	const dataRowCount = lines.filter(
		(line) => line.items.length >= 3 && line.items.every((item) => isValueItem(item.text))
	).length;
	if (dataRowCount >= Math.max(3, Math.ceil(lines.length * 0.3)))
		return lines.map((line) => joinItems([...line.items])).filter(Boolean);
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
