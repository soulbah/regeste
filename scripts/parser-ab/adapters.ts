// Parser adapters under test.
//
// Every adapter returns the same two views per page, because the pipeline needs
// both and they have different jobs:
//
//   citationText  what a citation points into. Offsets are taken against this,
//                 so it must stay the document's own words, never rewritten.
//   retrievalText what gets embedded and searched. Free to add structure the
//                 page implies (a column name, a table row) as long as nothing
//                 is invented.
//
// src/lib/pipeline/parse/pdf-layout.ts already draws that line: `text` is cited,
// `retrievalContext` is retrieval-only. The adapters keep it, which is what
// makes a markdown-emitting parser comparable to ours at all.

import { orderPdfText } from '../../src/lib/pipeline/parse/pdf-layout';
import { normalizeFormMarks } from '../../src/lib/pipeline/parse/pdf-form-marks';
import { assessPdfTextLayer } from '../../src/lib/pipeline/pdf-text-quality';
import { markdownToLines, shouldUseMarkdown } from '../../src/lib/pipeline/parse/pdf-markdown';
import {
	isUntrustedScan,
	largestRasterCoverage,
	textCoverage,
	textLayerTooThin
} from '../../src/lib/pipeline/parse/pdf-scan';

export interface AdapterPage {
	page: number;
	citationText: string;
	retrievalText: string;
	needsOcr: boolean;
}

export interface AdapterResult {
	pages: AdapterPage[];
	ms: number;
}

export interface Adapter {
	id: string;
	/** One line on what this configuration is meant to be good at. */
	note: string;
	parse(bytes: Uint8Array): Promise<AdapterResult>;
}

// --- shared pdf.js text extraction ---------------------------------------

type Positioned = { text: string; x: number; y: number; width: number };

/** The slice of pdf.js this harness touches. The legacy build ships no types. */
interface PdfTextItem {
	str?: string;
	transform?: number[];
	width?: number;
}
interface PdfPage {
	getViewport(options: { scale: number }): { width: number; height: number };
	getTextContent(): Promise<{ items: PdfTextItem[] }>;
	getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
	cleanup(): void;
}
interface PdfDocument {
	numPages: number;
	getPage(pageNumber: number): Promise<PdfPage>;
}
interface PdfLoadingTask {
	promise: Promise<PdfDocument>;
	destroy(): Promise<void>;
}
interface PdfjsLib {
	getDocument(options: Record<string, unknown>): PdfLoadingTask;
	OPS: Record<string, number>;
}

let pdfjsModule: Promise<PdfjsLib> | null = null;
function pdfjs(): Promise<PdfjsLib> {
	// The legacy build is the one that runs outside a browser; the app uses the
	// modern build plus a worker. Text extraction is identical.
	pdfjsModule ??= import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfjsLib>;
	return pdfjsModule;
}

function isPositionable(
	item: PdfTextItem
): item is PdfTextItem & { str: string; transform: number[] } {
	return typeof item.str === 'string' && Array.isArray(item.transform);
}

async function pdfjsPages(
	bytes: Uint8Array,
	detectScans = false
): Promise<{ items: Positioned[][]; widths: number[]; numPages: number; scans: Set<number> }> {
	const lib = await pdfjs();
	const task = lib.getDocument({
		data: bytes.slice(0),
		useWorkerFetch: false,
		isEvalSupported: false,
		useSystemFonts: false,
		verbosity: 0
	});
	const doc = await task.promise;
	const widths: number[] = [];
	const items: Positioned[][] = [];
	const scans = new Set<number>();
	for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
		const page = await doc.getPage(pageNum);
		const viewport = page.getViewport({ scale: 1 });
		widths.push(viewport.width);
		const content = await page.getTextContent();
		if (detectScans) {
			const pageArea = viewport.width * viewport.height;
			const glyphs = content.items.flatMap((item) =>
				typeof item.width === 'number' && typeof (item as { height?: number }).height === 'number'
					? [{ width: item.width, height: (item as { height: number }).height }]
					: []
			);
			const coverage = textCoverage(glyphs, pageArea);
			if (textLayerTooThin(coverage)) {
				const raster = largestRasterCoverage(await page.getOperatorList(), lib.OPS, pageArea);
				if (isUntrustedScan(raster, coverage)) scans.add(pageNum);
			}
		}
		items.push(
			content.items
				.filter(isPositionable)
				// Same rotated-text filter as the app: transform[0] near zero means
				// the glyphs run vertically (print-margin stamps).
				.filter((item) => Math.abs(item.transform[0]) > 0.01)
				.map((item) => ({
					text: item.str.trim(),
					x: item.transform[4],
					y: item.transform[5],
					width: typeof item.width === 'number' ? item.width : 0
				}))
				.filter((item: Positioned) => item.text.length > 0)
		);
		page.cleanup();
	}
	await task.destroy();
	return { items, widths, numPages: doc.numPages, scans };
}

/**
 * The shipped pipeline.
 *
 * This mirrors the body of `parsePdf` in src/lib/pipeline/parse/pdf.ts. It is
 * duplicated rather than imported because that module resolves the pdf.js
 * worker through a Vite-only `?url` import, which cannot load under bun. The
 * three modules that make the actual parsing decisions — orderPdfText,
 * normalizeFormMarks, assessPdfTextLayer — are imported directly, so the
 * measured behaviour is the app's, not a re-implementation.
 */
export const oursAdapter: Adapter = {
	id: 'ours',
	note: 'shipped pipeline: pdf.js text positions + XY-cut gutters + table-header binding',
	async parse(bytes) {
		const started = performance.now();
		const { items, widths } = await pdfjsPages(bytes);
		const normalized = normalizeFormMarks(items);
		const pages: AdapterPage[] = normalized.map((pageItems, index) => {
			const lines = orderPdfText(pageItems, widths[index]);
			const citationText = lines.map((line) => line.text).join('\n');
			const retrievalText = lines
				.map((line) =>
					line.retrievalContext ? `${line.text}\t${line.retrievalContext}` : line.text
				)
				.join('\n');
			return {
				page: index + 1,
				citationText,
				retrievalText,
				needsOcr: assessPdfTextLayer(citationText).reason !== null
			};
		});
		return { pages, ms: performance.now() - started };
	}
};

// --- liteparse -----------------------------------------------------------

export const LITEPARSE_PACKAGE = '@llamaindex/liteparse-wasm';

type LiteparseModule = typeof import('@llamaindex/liteparse-wasm');
type LiteParseInit = import('@llamaindex/liteparse-wasm').LiteParseInit;

let liteparse: Promise<LiteparseModule> | null = null;
async function loadLiteparse(): Promise<LiteparseModule> {
	liteparse ??= (async () => {
		const mod = await import(LITEPARSE_PACKAGE);
		const wasmUrl = import.meta.resolve(`${LITEPARSE_PACKAGE}/liteparse_wasm_bg.wasm`);
		const wasm = new Uint8Array(await Bun.file(new URL(wasmUrl).pathname).arrayBuffer());
		await mod.default({ module_or_path: wasm });
		return mod;
	})();
	return liteparse;
}

export async function liteparseAvailable(): Promise<boolean> {
	try {
		await loadLiteparse();
		return true;
	} catch {
		return false;
	}
}

/**
 * Config knobs that matter for this corpus, from the package's own typings:
 *
 *   keepHeadersFooters   default false — running headers/footers are stripped.
 *                        Cheap noise reduction, but it also removes the page
 *                        chrome a citation may legitimately land on.
 *   preserveVerySmallText default false — drops very small glyphs. French
 *                        policy documents put binding sublimits in 5pt type,
 *                        so dropping them loses answers.
 *   skipDiagonalText     default false — rotated watermarks/stamps. The app
 *                        already filters these out of pdf.js, so turning it on
 *                        makes the two sides comparable.
 *   imageMode 'off'      no image placeholders in text output.
 *   maxPages             defaults to 1000; raised so long documents are not
 *                        silently truncated mid-corpus.
 */
function liteparseConfig(overrides: LiteParseInit): LiteParseInit {
	return {
		ocrEnabled: false,
		imageMode: 'off',
		maxPages: 10_000,
		skipDiagonalText: true,
		preserveVerySmallText: true,
		quiet: true,
		...overrides
	};
}

async function liteparseParse(bytes: Uint8Array, config: LiteParseInit) {
	const mod = await loadLiteparse();
	const parser = new mod.LiteParse(config);
	try {
		const started = performance.now();
		const result = await parser.parse(bytes);
		return { result, ms: performance.now() - started };
	} finally {
		parser.free?.();
	}
}

/** One liteparse output format used for both views (the naive drop-in). */
export function liteparseAdapter(
	format: 'text' | 'markdown',
	overrides: LiteParseInit = {},
	suffix = ''
): Adapter {
	return {
		id: `liteparse:${format}${suffix}`,
		note: `liteparse ${format} for both views${suffix ? ` (${suffix.replace(/^\+/, '')})` : ''}`,
		async parse(bytes) {
			const { result, ms } = await liteparseParse(
				bytes,
				liteparseConfig({ outputFormat: format, includeComplexity: true, ...overrides })
			);
			return {
				ms,
				pages: result.pages.map((page) => {
					const body = (format === 'markdown' ? page.markdown : page.text) ?? '';
					return {
						page: page.pageNum,
						citationText: body,
						retrievalText: body,
						needsOcr: Boolean(page.complexity?.needsOcr)
					};
				})
			};
		}
	};
}

/**
 * The configuration this evaluation actually proposes adopting: liteparse's
 * plain page text carries citations (so character offsets keep pointing at the
 * document's own words) while its markdown — table pipes, headings, stripped
 * page chrome — is the retrieval view only. One parse produces both, so this
 * costs nothing over either single-format adapter.
 */
export function liteparseHybridAdapter(overrides: LiteParseInit = {}): Adapter {
	return {
		id: 'liteparse:hybrid',
		note: 'text view for citations + markdown view for retrieval (proposed integration)',
		async parse(bytes) {
			const { result, ms } = await liteparseParse(
				bytes,
				liteparseConfig({ outputFormat: 'markdown', includeComplexity: true, ...overrides })
			);
			return {
				ms,
				pages: result.pages.map((page) => ({
					page: page.pageNum,
					citationText: page.text ?? '',
					retrievalText: page.markdown ?? '',
					needsOcr: Boolean(page.complexity?.needsOcr)
				}))
			};
		}
	};
}

/** Amounts, percentages and the words French tariffs use instead of a number. */
const VALUE_CELL =
	/^\s*(?:[*_`]*\s*)?(?:\d{1,3}(?:[\u00a0\u202f ]\d{3})*(?:,\d{1,2})?\s?(?:€|%)|gratuit|offert|n[ée]ant|nous consulter|frais r[ée]els)/i;

/**
 * Does this markdown row bind a label to a value?
 *
 * The measured win from liteparse is exactly that: on a ruled tariff table it
 * keeps "Tenue de compte" with "4,85 €/trimestre" where text positions shear
 * them apart. The measured loss is that it renders *any* two-column layout as a
 * table, so an insurance IPID's "what is covered" box and its "what is NOT
 * covered" box become one row and the answer inverts.
 *
 * Asking whether the row's last non-empty cell is a value separates the two by
 * the property the win actually depends on, rather than by a length threshold
 * fitted to this corpus — IPID rows are short bullets, so length does not
 * separate them.
 */
function bindsAValue(line: string): boolean {
	const cells = line
		.split('|')
		.map((cell) => cell.trim())
		.filter((cell) => cell.length > 0 && !/^[-: ]+$/.test(cell));
	if (cells.length < 2) return false;
	return VALUE_CELL.test(cells[cells.length - 1]);
}

/**
 * Per-page routing between the two parsers, using each where it is measurably
 * better rather than picking one for the whole corpus.
 *
 * liteparse's markdown reconstructs ruled financial tables that our text-position
 * heuristics shear, but it also fuses any two-column layout into table rows —
 * which on an IPID pairs a covered peril with an exclusion on one line and
 * inverts the answer. A page keeps the markdown view only when its table rows
 * look like data (short cells); a page whose "table" is really two columns of
 * prose falls back to the line-based reading order.
 */
export function routedAdapter(): Adapter {
	return {
		id: 'routed',
		note: 'liteparse markdown on data-table pages, our line order on prose-column pages',
		async parse(bytes) {
			const started = performance.now();
			const ours = await oursAdapter.parse(bytes);
			const { result } = await liteparseParse(
				bytes,
				liteparseConfig({ outputFormat: 'markdown', includeComplexity: true })
			);
			const pages = result.pages.map((page, index) => {
				const markdown = page.markdown ?? '';
				const rows = markdown.split('\n').filter((line) => line.includes('|'));
				// Keep the markdown view only where it is doing the job it wins at:
				// a quarter of the table rows ending in a value is enough to mark a
				// price table, while a two-box prose layout has essentially none.
				const binding = rows.filter(bindsAValue).length;
				const useMarkdown = rows.length > 0 && binding * 4 >= rows.length;
				const fallback = ours.pages[index];
				return {
					page: page.pageNum,
					// Citations always point into the document's own words.
					citationText: page.text ?? fallback?.citationText ?? '',
					retrievalText: useMarkdown ? markdown : (fallback?.retrievalText ?? page.text ?? ''),
					needsOcr: fallback?.needsOcr ?? Boolean(page.complexity?.needsOcr)
				};
			});
			return { pages, ms: performance.now() - started };
		}
	};
}

/**
 * What `src/lib/pipeline/parse/pdf.ts` now does.
 *
 * The routing predicate, the markdown-to-text conversion and the scan test are
 * imported from the app rather than restated, so this measures shipped
 * behaviour. Only the wasm loading differs: the app resolves it through a
 * Vite-only `?url` import, which cannot load under bun.
 */
export function shippedAdapter(): Adapter {
	return {
		id: 'shipped',
		note: 'src/lib/pipeline/parse/pdf.ts as it now stands: routed tables + raster scan triage',
		async parse(bytes) {
			const started = performance.now();
			const { items, widths, scans } = await pdfjsPages(bytes, true);
			const { result } = await liteparseParse(bytes, liteparseConfig({ outputFormat: 'markdown' }));
			const routed = new Map<number, string[]>();
			for (const page of result.pages) {
				const markdown = page.markdown ?? '';
				if (!shouldUseMarkdown(markdown)) continue;
				const lines = markdownToLines(markdown);
				if (lines.length) routed.set(page.pageNum, lines);
			}
			const normalized = normalizeFormMarks(items);
			const pages: AdapterPage[] = normalized.map((pageItems, index) => {
				const pageNum = index + 1;
				const positioned = orderPdfText(pageItems, widths[index]);
				const lines = routed.get(pageNum) ?? positioned.map((line) => line.text);
				const text = lines.join('\n');
				const retrievalText = routed.has(pageNum)
					? text
					: positioned
							.map((line) =>
								line.retrievalContext ? `${line.text}\t${line.retrievalContext}` : line.text
							)
							.join('\n');
				return {
					page: pageNum,
					citationText: text,
					retrievalText,
					needsOcr: assessPdfTextLayer(text).reason !== null || scans.has(pageNum)
				};
			});
			return { pages, ms: performance.now() - started };
		}
	};
}

/** Variant: markdown on value tables, liteparse's plain text everywhere else
 *  instead of our position-derived order. Tests whether our reading order is
 *  worth keeping at all once liteparse is already loaded. */
export function routedTextBaseAdapter(): Adapter {
	return {
		id: 'routed:text-base',
		note: 'markdown on value tables, liteparse text elsewhere (no position-derived order)',
		async parse(bytes) {
			const started = performance.now();
			const { result } = await liteparseParse(
				bytes,
				liteparseConfig({ outputFormat: 'markdown', includeComplexity: true })
			);
			const pages: AdapterPage[] = result.pages.map((page) => {
				const markdown = page.markdown ?? '';
				const body = shouldUseMarkdown(markdown)
					? markdownToLines(markdown).join('\n')
					: (page.text ?? '');
				return {
					page: page.pageNum,
					citationText: page.text ?? '',
					retrievalText: body,
					needsOcr: Boolean(page.complexity?.needsOcr)
				};
			});
			return { pages, ms: performance.now() - started };
		}
	};
}

// --- the OCR path ---------------------------------------------------------
//
// A scanned page cannot be measured against this corpus directly: the ground
// truth is read off born-digital documents, and running recognition on a
// rasterised version of them would mix recognition errors into a question that
// is purely about layout.
//
// So the recognizer's *granularity* is simulated on the same pages instead.
// PP-OCRv5 returns one box per detected text region grouped into lines, which
// is coarser than pdf.js text runs and finer than a paragraph, and it is the
// only input the OCR path ever gets. Both adapters below are fed exactly that,
// and differ only in what they do with it:
//
//   ocr:naive   the lines joined top-to-bottom, boxes discarded — what
//               src/lib/pipeline/ocr.ts emitted before the boxes were kept.
//   ocr:boxes   the same lines through orderPdfText, which is what it emits now.
//
// The delta between the two rows is the change, measured on hand-verified
// pairs. What this cannot show is recognition quality, which is unchanged.

/**
 * Gap at which the detector stops merging neighbouring words into one box.
 *
 * Measured on the real recogniser rather than assumed, because the assumed
 * value (half a line height) was half the truth and made the first run of this
 * comparison meaningless. Pairs of words drawn at a widening gap in 13pt text
 * came back as one box up to 12pt and as two from 16pt — about 1.08 times the
 * font size. The corpus sets body text at 9-13pt, so 14 points is the middle of
 * the measured band. `src/routes/dev/ocr-eval` reproduces it.
 */
const OCR_SEGMENT_GAP = 14;

/** pdf.js runs regrouped the way the recognizer would return them: clustered
 *  into lines, then merged along each line wherever the gap is small. */
function asRecognizedLines(items: Positioned[]): Positioned[][] {
	const lines: Positioned[][] = [];
	for (const item of items) {
		const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= 2);
		if (line) line.push(item);
		else lines.push([item]);
	}
	lines.sort((left, right) => right[0].y - left[0].y);
	return lines.map((line) => {
		const sorted = [...line].sort((left, right) => left.x - right.x);
		const merged: Positioned[] = [];
		for (const item of sorted) {
			const previous = merged[merged.length - 1];
			if (previous && item.x - (previous.x + previous.width) < OCR_SEGMENT_GAP) {
				previous.text = `${previous.text} ${item.text}`;
				previous.width = item.x + item.width - previous.x;
			} else {
				merged.push({ ...item });
			}
		}
		return merged;
	});
}

function ocrAdapter(id: 'ocr:naive' | 'ocr:boxes'): Adapter {
	return {
		id,
		note:
			id === 'ocr:naive'
				? 'recognized lines joined top-to-bottom, boxes discarded (the OCR path before)'
				: 'the same recognized lines through orderPdfText (the OCR path now)',
		async parse(bytes) {
			const started = performance.now();
			const { items, widths } = await pdfjsPages(bytes);
			const pages: AdapterPage[] = items.map((pageItems, index) => {
				const lines = asRecognizedLines(pageItems);
				let citationText: string;
				let retrievalText: string;
				if (id === 'ocr:naive') {
					citationText = lines.map((line) => line.map((item) => item.text).join(' ')).join('\n');
					retrievalText = citationText;
				} else {
					const ordered = orderPdfText(lines.flat(), widths[index]);
					citationText = ordered.map((line) => line.text).join('\n');
					retrievalText = ordered
						.map((line) =>
							line.retrievalContext ? `${line.text}\t${line.retrievalContext}` : line.text
						)
						.join('\n');
				}
				return {
					page: index + 1,
					citationText,
					retrievalText,
					needsOcr: assessPdfTextLayer(citationText).reason !== null
				};
			});
			return { pages, ms: performance.now() - started };
		}
	};
}

export function ocrNaiveAdapter(): Adapter {
	return ocrAdapter('ocr:naive');
}

export function ocrBoxesAdapter(): Adapter {
	return ocrAdapter('ocr:boxes');
}

export function defaultAdapters(): Adapter[] {
	return [
		oursAdapter,
		liteparseAdapter('text'),
		liteparseAdapter('markdown'),
		liteparseHybridAdapter(),
		liteparseAdapter('markdown', { keepHeadersFooters: true }, '+chrome'),
		routedAdapter(),
		shippedAdapter(),
		routedTextBaseAdapter(),
		ocrNaiveAdapter(),
		ocrBoxesAdapter(),
		// Scores nothing unless a Marker run has been precomputed, so it costs
		// nothing to leave registered and it is reachable with --only marker.
		markerAdapter()
	];
}

// --- Marker, as a reference rather than a candidate ----------------------

/**
 * Marker's output, scored on the same pairs as everything else.
 *
 * Marker cannot ship here: it is Python, it wants a GPU, and it took about 23
 * seconds on a single page of the owner's attestation. It is in this harness as
 * an ORACLE — the number that says how much of the gap between our parser and
 * the field is real, and therefore how much a browser-capable layout model
 * could be worth. Chasing a ceiling is only sensible once you have measured it.
 *
 * Runs are precomputed because a Python subprocess per document would make the
 * harness unusable:
 *
 *   marker_single <pdf> --output_dir .marker-out --output_format markdown --paginate_output
 *
 * The adapter keys on a hash of the bytes rather than on a file name, since the
 * `Adapter` contract passes bytes alone and inventing a second channel for the
 * name would leak this one experiment into every other adapter.
 */
export function markerAdapter(outputDir = '.marker-out', corpusDir = '.benchmark-corpus/parser-ab'): Adapter {
	let index: Map<string, string> | null = null;

	const buildIndex = async (): Promise<Map<string, string>> => {
		const { createHash } = await import('node:crypto');
		const { readdir, readFile } = await import('node:fs/promises');
		const { join } = await import('node:path');
		const map = new Map<string, string>();
		let files: string[] = [];
		try {
			files = await readdir(corpusDir);
		} catch {
			return map;
		}
		for (const name of files) {
			if (!name.endsWith('.pdf')) continue;
			const stem = name.slice(0, -4);
			try {
				const bytes = await readFile(join(corpusDir, name));
				const markdown = await readFile(join(outputDir, stem, `${stem}.md`), 'utf8');
				map.set(createHash('sha256').update(bytes).digest('hex'), markdown);
			} catch {
				// No Marker run for this document. Absent, not empty: the runner
				// reports it as skipped rather than scoring it as a failure.
			}
		}
		return map;
	};

	return {
		id: 'marker',
		note: 'ORACLE, not shippable: python + GPU, ~23 s/page. Precompute with marker_single --paginate_output',
		async parse(bytes) {
			const started = performance.now();
			const { createHash } = await import('node:crypto');
			index ??= await buildIndex();
			const markdown = index.get(createHash('sha256').update(bytes).digest('hex'));
			if (markdown === undefined) return { pages: [], ms: performance.now() - started };
			// `--paginate_output` writes "{PAGE_NUMBER}------" separators. The
			// number is the page it OPENS, so the split's first element is the
			// preamble before page 0 and is dropped.
			const parts = markdown.split(/\n*\{(\d+)\}-{6,}\n*/u);
			const pages: AdapterPage[] = [];
			for (let i = 1; i < parts.length; i += 2) {
				const text = (parts[i + 1] ?? '').trim();
				pages.push({
					page: Number(parts[i]) + 1,
					// Marker emits one markdown view. Citations would need the
					// document's own words, which is exactly what this oracle does
					// not preserve — another reason it is a reference and not a
					// candidate.
					citationText: text.replace(/[*_`#|]/gu, ' ').replace(/[ \t]+/gu, ' '),
					retrievalText: text,
					needsOcr: false
				});
			}
			return { pages, ms: performance.now() - started };
		}
	};
}
