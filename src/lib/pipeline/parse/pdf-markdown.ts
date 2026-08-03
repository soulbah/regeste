// Table reconstruction for pages whose values would otherwise come loose.
//
// Our reading order is built from text positions, which cannot see a table's
// ruling. When a price cell sits vertically offset from the label it prices —
// routine in French tariff and policy documents — the label and its value end
// up on different output lines, and the chunk that answers the question carries
// the wrong number. Measured on the evaluation corpus: 10 wrong bindings in 87
// hand-checked pairs, and 30% of all euro amounts on a line with nothing that
// names them.
//
// liteparse reads the ruling from the page's vector graphics and rebuilds those
// rows correctly (0 wrong bindings). It also renders *any* two-column layout as
// a table, which on an insurance IPID fuses the "what is covered" box with the
// "what is NOT covered" box and inverts the answer (14 contaminated statements
// of 48, against 2 for our reading order).
//
// So the markdown is kept per page, only where it is doing the thing it wins
// at: binding values to labels.

/** A typed numeric cell: amounts, dates, percentages, measurements and table
 * quantities all start with a number. Units stay open-ended so routing never
 * needs a document- or language-specific vocabulary. */
const VALUE_CELL = /^\s*(?:[*_`]*\s*)?(?:[<>≤≥~≈]\s*)?\d(?:[\d\s.,]*\d)?(?:\s|$)/u;

function cellsOf(line: string): string[] {
	return line
		.split('|')
		.map((cell) => cell.trim())
		.filter((cell) => cell.length > 0 && !/^[-: ]+$/.test(cell));
}

/** A row that ends in a value is a row that prices something. */
export function bindsAValue(line: string): boolean {
	const cells = cellsOf(line);
	return cells.length >= 2 && VALUE_CELL.test(cells[cells.length - 1]);
}

/**
 * Should this page's markdown replace the position-derived reading order?
 *
 * A quarter of the table rows ending in a value is enough to call it a price
 * table: real ones carry section rows and continuation rows that end in prose,
 * while a two-column prose layout has essentially none.
 *
 * Cell length was the obvious alternative and does not work — an IPID's rows
 * are short bullets, so length does not separate a bullet list from a tariff.
 */
export function shouldUseMarkdown(markdown: string): boolean {
	const rows = markdown.split('\n').filter((line) => line.includes('|'));
	if (!rows.length) return false;
	return rows.filter(bindsAValue).length * 5 >= rows.length;
}

/**
 * Markdown back to citable text, one line per row.
 *
 * Citations point into this, so it must stay the document's own words: only
 * liteparse's own syntax is removed, never content. Cells are joined with a
 * space because that is how the row reads on the page.
 */
export function markdownLineToText(line: string): string {
	if (line.includes('|')) return cellsOf(line).join(' ');
	return line
		.replace(/^#{1,6}\s+/, '')
		.replace(/^\s*[-*+]\s+/, '')
		.replace(/\*\*(.+?)\*\*/g, '$1')
		.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.trim();
}

/** Every content line of a page's markdown, as citable text. */
export function markdownToLines(markdown: string): string[] {
	return markdown
		.split('\n')
		.map(markdownLineToText)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !/^-{3,}$/.test(line));
}

// --- runtime -------------------------------------------------------------

interface LiteParsePage {
	pageNum: number;
	markdown?: string;
}

let parserPromise: Promise<((bytes: Uint8Array) => Promise<LiteParsePage[]>) | null> | null = null;

/**
 * Load liteparse lazily and once.
 *
 * ~1.9 MB brotli, so it must never be on the critical path of anything but a
 * PDF. A failure here is not fatal: the caller keeps the position-derived
 * reading order, which is what shipped before.
 */
async function loadParser(): Promise<((bytes: Uint8Array) => Promise<LiteParsePage[]>) | null> {
	parserPromise ??= (async () => {
		try {
			const [module, wasmUrl] = await Promise.all([
				import('@llamaindex/liteparse-wasm'),
				import('@llamaindex/liteparse-wasm/liteparse_wasm_bg.wasm?url').then((m) => m.default)
			]);
			await module.default({ module_or_path: wasmUrl });
			return async (bytes: Uint8Array) => {
				const parser = new module.LiteParse({
					ocrEnabled: false,
					outputFormat: 'markdown',
					imageMode: 'off',
					maxPages: 10_000,
					// The app already drops rotated glyphs from pdf.js; keeping the two
					// sides consistent stops a watermark appearing in one view only.
					skipDiagonalText: true,
					// French policy documents put binding sublimits in 5pt type.
					preserveVerySmallText: true,
					quiet: true
				});
				try {
					const result = await parser.parse(bytes);
					return result.pages.map((page) => ({
						pageNum: page.pageNum,
						markdown: page.markdown
					}));
				} finally {
					parser.free?.();
				}
			};
		} catch {
			return null;
		}
	})();
	return parserPromise;
}

/**
 * Markdown lines for the pages that should use them, keyed by page number.
 * Pages absent from the map keep the position-derived reading order.
 */
export async function tableLinesByPage(data: ArrayBuffer): Promise<Map<number, string[]>> {
	const parse = await loadParser();
	const routed = new Map<number, string[]>();
	if (!parse) return routed;
	try {
		// slice() so the caller's buffer cannot be detached: ingest and ocrDocument
		// both reuse it after parsing.
		const pages = await parse(new Uint8Array(data.slice(0)));
		for (const page of pages) {
			const markdown = page.markdown ?? '';
			if (!shouldUseMarkdown(markdown)) continue;
			const lines = markdownToLines(markdown);
			if (lines.length) routed.set(page.pageNum, lines);
		}
	} catch {
		// Any failure leaves every page on the reading order that shipped before.
		return new Map();
	}
	return routed;
}
