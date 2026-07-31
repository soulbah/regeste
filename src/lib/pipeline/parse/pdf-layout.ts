import { tableRowContext } from './docx';

export interface PositionedPdfText {
	text: string;
	x: number;
	y: number;
	width: number;
}

/**
 * A reconstructed line of the page.
 *
 * `text` is the source text and the only thing ever cited — reconstruction must
 * never rewrite it. `retrievalContext` is a retrieval-only view that names the
 * column each value came from, present only on the rows of a table whose header
 * was identified with confidence.
 */
export interface ReconstructedLine {
	text: string;
	retrievalContext?: string;
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

/** A cell that is a monetary/numeric amount: a bare number (French thousands
 * spaced) optionally trailed by a currency mark. A row whose rightmost cell is
 * one of these is a line-item / subtotal / statement row (invoice, devis,
 * schedule), and column-major emission would shear the amount away from its
 * label — the "Extension … 17 056,11 €" bug. Prose cells (an IPID coverage
 * grid, a wrapped description) never match, so those tables stay column-major. */
function isAmountCell(cell: string): boolean {
	const text = cell.trim();
	if (!/\d/.test(text)) return false;
	return (
		/(?:€|eur\b|euros?\b|%)\s*$/iu.test(text) ||
		/^[\d][\d\s.,]*$/u.test(text) ||
		/^[\d][\d\s.,]*\s*(?:€|eur|euros?)$/iu.test(text)
	);
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

/** Paths that carry no column structure (prose, two-column articles) still emit
 * lines; they simply have no header to bind. */
function asLines(texts: string[]): ReconstructedLine[] {
	return texts.map((text) => ({ text }));
}

const itemCentre = (item: PositionedPdfText) => item.x + Math.max(item.width, 1) / 2;

/**
 * Column centres, taken from the data rows themselves.
 *
 * A schedule's value rows are the most reliable description of its geometry:
 * there are hundreds of them, each holds exactly one value per column, and the
 * values are narrow and consistently placed. Deriving columns from them and
 * then placing the header's words into those columns avoids having to guess
 * where one multi-word label ends and the next begins — "Capital Restant dû
 * Montant échéance" cannot be split by looking at spaces alone.
 */
function dataRowColumns(rows: PdfLine[], tolerance: number): number[] {
	const centres = rows.flatMap((row) => row.items.map(itemCentre)).sort((a, b) => a - b);
	if (!centres.length) return [];
	const clusters: number[][] = [[centres[0]]];
	for (const centre of centres.slice(1)) {
		const current = clusters[clusters.length - 1];
		if (centre - current[current.length - 1] <= tolerance) current.push(centre);
		else clusters.push([centre]);
	}
	// A column every row populates; a stray annotation forms a thin cluster.
	const floor = Math.max(2, Math.ceil(rows.length * 0.5));
	return clusters
		.filter((cluster) => cluster.length >= floor)
		.map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length);
}

/** Nearest column to an item's centre. */
function columnOfCentre(item: PositionedPdfText, columns: number[]): number {
	let best = 0;
	for (let index = 1; index < columns.length; index++) {
		if (Math.abs(itemCentre(item) - columns[index]) < Math.abs(itemCentre(item) - columns[best]))
			best = index;
	}
	return best;
}

function cellsByColumn(line: PdfLine, columns: number[]): string[] {
	const cells = Array.from({ length: columns.length }, () => [] as PositionedPdfText[]);
	for (const item of line.items) cells[columnOfCentre(item, columns)].push(item);
	return cells.map((items) => joinItems(items));
}

/**
 * Bind a data table's header to each of its rows, for the row-ordered paths.
 *
 * Returns one entry per input line. `text` is untouched; rows of a table whose
 * header was found also carry the header-labelled view. Conservative by design:
 * without a credible header, or without stable column geometry, nothing is
 * bound — a wrong binding states a falsehood as structure, which is worse than
 * leaving a reader to see bare values.
 */
function bindTableHeaders(
	lines: PdfLine[],
	pageWidth: number,
	/** A line emitted just before this block that may be its header. Consulted
	 * for labels, never emitted here — the caller already emitted it. */
	headerHint: PdfLine | null = null
): ReconstructedLine[] {
	const plain = () => asLines(lines.map((line) => joinItems([...line.items])).filter(Boolean));
	const isValueItem = (text: string) => /^[\d\s.,/€%'-]+$/.test(text) && /\d/.test(text);
	const isDataRow = (line: PdfLine) =>
		line.items.length >= 3 && line.items.every((item) => isValueItem(item.text));
	const dataRows = lines.filter(isDataRow);
	if (dataRows.length < 3) return plain();

	const columns = dataRowColumns(dataRows, Math.max(6, pageWidth * 0.02));
	// Fewer than three columns is a list, not a table worth labelling.
	if (columns.length < 3) return plain();

	/** A header names most of the columns and holds no values of its own. */
	const labelsOf = (candidate: PdfLine): string[] | null => {
		if (!candidate.items.length || candidate.items.some((item) => isValueItem(item.text)))
			return null;
		const cells = cellsByColumn(candidate, columns);
		const named = cells.filter((cell) => /\p{L}/u.test(cell)).length;
		return named >= Math.ceil(columns.length * 0.6) ? cells : null;
	};

	// The nearest line above the first data row, then the caller's hint.
	const firstDataIndex = lines.findIndex(isDataRow);
	let labels: string[] | null = null;
	for (let index = firstDataIndex - 1; index >= 0 && index >= firstDataIndex - 3; index--) {
		labels = labelsOf(lines[index]);
		if (labels) break;
	}
	if (!labels && headerHint) labels = labelsOf(headerHint);
	if (!labels) return plain();

	return lines
		.map((line) => {
			const text = joinItems([...line.items]);
			if (!text) return null;
			return isDataRow(line)
				? { text, retrievalContext: tableRowContext(labels!, cellsByColumn(line, columns)) }
				: { text };
		})
		.filter((line): line is ReconstructedLine => line !== null);
}

function columnOf(item: PositionedPdfText, gutters: number[]): number {
	let column = 0;
	for (const gutter of gutters) if (item.x >= gutter) column++;
	return column;
}

/** Emit a multi-column table page region by region: full-width lines separate
 * regions, and inside a columnar region cells are emitted column-major so a
 * multi-line cell stays contiguous instead of interleaving with its neighbors. */
function emitColumnRegions(
	lines: PdfLine[],
	gutters: number[],
	pageWidth: number
): ReconstructedLine[] {
	const crossesGutter = (line: PdfLine) =>
		line.items.some((item) =>
			gutters.some((gutter) => item.x < gutter && item.x + Math.max(item.width, 1) > gutter)
		);
	const out: ReconstructedLine[] = [];
	let region: PdfLine[] = [];
	/** Cells of the last full-width line that looked like a table header, so the
	 * region it introduces can bind to it. Reset by any other separator, so only
	 * an immediately preceding header ever applies. */
	let pendingHeaderLine: PdfLine | null = null;
	// A data-table row is a self-contained record: two or more columns whose
	// every cell is a bare value (number, amount, date). An amortization
	// schedule is made of them; a fact-sheet table (checkbox grids, IPID-style
	// prose cells that wrap over several lines) has none. Data rows must be
	// emitted row-major — column-major shears the record apart and re-titles a
	// lone column with the full table header, which is how an
	// outstanding-balance cell got answered as the first installment.
	const isValueCell = (cell: string) => /^[\d\s.,/€%'-]+$/.test(cell) && /\d/.test(cell);
	const isDataRow = (line: PdfLine) => {
		const columns = [...new Set(line.items.map((item) => columnOf(item, gutters)))];
		if (columns.length < 2) return false;
		return columns.every((column) =>
			isValueCell(joinItems(line.items.filter((item) => columnOf(item, gutters) === column)))
		);
	};
	// A line-item / subtotal row: a label on the left and a monetary amount in
	// its rightmost populated column ("2 Extension … 17 056,11 €"). These MUST
	// stay row-major; column-major would file the amount under a bare column,
	// unbindable from its label.
	const endsWithAmount = (line: PdfLine) => {
		const columns = [...new Set(line.items.map((item) => columnOf(item, gutters)))].sort(
			(left, right) => left - right
		);
		if (columns.length < 2) return false;
		const lastColumn = columns[columns.length - 1];
		return isAmountCell(
			joinItems(line.items.filter((item) => columnOf(item, gutters) === lastColumn))
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
		const dataRows = region.filter((line) => isDataRow(line) || endsWithAmount(line)).length;
		if (region.length >= 3 && dataRows >= Math.max(3, Math.ceil(region.length * 0.5))) {
			// Row-major: each record stays one line, headers keep their own line.
			// One binder for both ordering paths, and it derives columns from the
			// data rows rather than from the page's gutters: gutter bands are wide
			// enough to merge two narrow numeric columns, which would label a value
			// with its neighbour's name.
			// A header's labels are wider than the numbers beneath them, so the
			// header line often straddles a gutter and is emitted as a region
			// separator before the region it heads; pass it in so it can be found.
			out.push(...bindTableHeaders(region, pageWidth, pendingHeaderLine));
		} else if (
			region.length >= 3 &&
			multiColumnLines >= Math.ceil(region.length * 0.3) &&
			everyColumnPopulated
		) {
			for (let column = 0; column <= gutters.length; column++) {
				for (const line of region) {
					const cell = joinItems(line.items.filter((item) => columnOf(item, gutters) === column));
					if (cell) out.push({ text: cell });
				}
			}
		} else {
			for (const line of region) {
				const text = joinItems([...line.items]);
				if (text) out.push({ text });
			}
		}
		region = [];
		// One region per header: a later region must not inherit it.
		pendingHeaderLine = null;
	};
	for (const line of lines) {
		if (crossesGutter(line)) {
			flush();
			const text = joinItems([...line.items]);
			if (text) out.push({ text });
			if (text) pendingHeaderLine = line;
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
/**
 * How far apart two baselines may be and still be one line.
 *
 * A table's value cell is set against the whole label block rather than against
 * the label's first line, so it lands a couple of points off it — measured on
 * the evaluation corpus, "Alerte solde disponible" sits at 454.0 and its
 * "0,32 € / alerte" at 456.5. At a tolerance of 2 they became separate lines and
 * the label bound to the next row's price instead.
 *
 * The ceiling is the leading: these documents set body text 9pt apart, so
 * anything below half of that cannot merge two real lines.
 */
const LINE_TOLERANCE = 3;

export function orderPdfText(items: PositionedPdfText[], pageWidth: number): ReconstructedLine[] {
	const lines: PdfLine[] = [];
	for (const item of items) {
		let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= LINE_TOLERANCE);
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
				? emitColumnRegions(regionLines, regionGutters[index], pageWidth)
				: orderLinesWithSingleGutter(regionLines, pageWidth)
		);
	}

	return orderLinesWithSingleGutter(lines, pageWidth);
}

/** A cell holding a sum of money or a rate, anywhere in it. Wider than
 *  `isAmountCell`, which asks where the amount sits; here only its presence
 *  matters. */
function holdsAnAmount(cell: string): boolean {
	return /\d[\d\s.,]*\s*(?:€|%)|\b(?:gratuit|offert|n[ée]ant)\b/iu.test(cell);
}

/** At most this share of a page's amounts may sit on the poorer side before the
 *  two columns stop looking like a price list. Zero would be brittle: one
 *  footnote carrying a rate should not re-enable a split that severs a table. */
const PRICE_COLUMN_LEAK = 0.15;
/** And there must be enough amounts for "all on one side" to mean anything. */
const PRICE_COLUMN_MINIMUM = 3;

/**
 * Are these two columns a service list and its prices rather than an article?
 *
 * The two-column split exists for prose set in columns, where reading down one
 * column and then the other is the only correct order. Applied to a tariff
 * table it is the worst thing the parser can do: every price is emitted after
 * every service, so no chunk holds a service beside what it costs. Measured on
 * the evaluation corpus, that single mistake accounts for nine of the twelve
 * label/value pairs the OCR path cannot find.
 *
 * The two cases separate cleanly on where the money is. An article about
 * pricing carries figures in both columns or in neither; a price list keeps
 * them all in one. On `bank-ce-2026-rgaa` p3 the right column holds 13 amounts
 * across 23 cells and the left column holds none across 55.
 */
function isPricedColumn(left: string[], right: string[]): boolean {
	const leftAmounts = left.filter(holdsAnAmount).length;
	const rightAmounts = right.filter(holdsAnAmount).length;
	const richer = Math.max(leftAmounts, rightAmounts);
	const poorer = Math.min(leftAmounts, rightAmounts);
	return richer >= PRICE_COLUMN_MINIMUM && poorer <= richer * PRICE_COLUMN_LEAK;
}

/** Original single-gutter path: split left/right only when a central gutter
 * recurs at nearly the same position on many lines; otherwise line order. */
function orderLinesWithSingleGutter(lines: PdfLine[], pageWidth: number): ReconstructedLine[] {
	// Data-table guard, same reasoning as in emitColumnRegions: a page whose
	// lines are rows of three-plus bare values (numbers, amounts, dates) is a
	// schedule, and the two-column article split would shear every record in
	// half — dates left, installments right (measured: an amortization page
	// answered "the first installment" with an outstanding balance).
	const isValueItem = (text: string) => /^[\d\s.,/€%'-]+$/.test(text) && /\d/.test(text);
	const dataRowCount = lines.filter(
		(line) => line.items.length >= 3 && line.items.every((item) => isValueItem(item.text))
	).length;
	// Line-item / statement rows ending in a monetary amount (invoice, devis):
	// the left/right article split would file every amount after every label,
	// severing "Extension" from "17 056,11 €". Keep them line-ordered.
	const amountEndingCount = lines.filter((line) => {
		if (line.items.length < 2) return false;
		const last = [...line.items].sort((left, right) => left.x - right.x).at(-1);
		return last !== undefined && isAmountCell(last.text);
	}).length;
	if (
		dataRowCount >= Math.max(3, Math.ceil(lines.length * 0.3)) ||
		amountEndingCount >= Math.max(3, Math.ceil(lines.length * 0.4))
	)
		// Row order is preserved, and where the table's header can be identified
		// each row also carries which column every value came from.
		return bindTableHeaders(lines, pageWidth);
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
	if (!twoColumns) return asLines(lines.map((line) => joinItems([...line.items])).filter(Boolean));

	const gutter = [...consistent].sort((left, right) => left - right)[
		Math.floor(consistent.length / 2)
	];
	const left = lines
		.map((line) => joinItems(line.items.filter((item) => item.x < gutter)))
		.filter(Boolean);
	const right = lines
		.map((line) => joinItems(line.items.filter((item) => item.x >= gutter)))
		.filter(Boolean);
	if (isPricedColumn(left, right)) return bindTableHeaders(lines, pageWidth);
	return asLines([...left, ...right]);
}
