// Metrics for the parser A/B.
//
// Four independent measures, deliberately not averaged into one score. Each
// states what it proves and what it cannot, because they trade off: a parser
// that concatenates a whole page onto one line scores perfectly on binding
// proximity and terribly on reading order.

import { normalizeForFuzzy } from '../../src/lib/pipeline/fuzzy';
import type { AdapterPage } from './adapters';

// --- shared normalisation -------------------------------------------------

/**
 * Amount-preserving normalisation. `normalizeForFuzzy` is the retrieval
 * normaliser and splits "4,85 €" into "4 85", which would make two different
 * prices compare equal. Binding metrics need prices to stay single tokens.
 */
export function normalizeAmounts(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[\u00a0\u202f\u2009]/g, ' ')
		.replace(/[’‘`´]/g, "'")
		.toLowerCase()
		.replace(/[^a-z0-9,.€%'\s-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** The repo's own evidence matcher (src/routes/dev/pipeline/+page.svelte). */
export function containsEvidence(text: string, normalizedNeedle: string): boolean {
	const normalizedText = normalizeForFuzzy(text);
	if (
		normalizedText.includes(normalizedNeedle) ||
		normalizedText.replaceAll(' ', '').includes(normalizedNeedle.replaceAll(' ', ''))
	)
		return true;
	const available = normalizedText.split(' ');
	const expected = normalizedNeedle.split(' ');
	let cursor = -1;
	for (const token of expected) {
		const next = available.findIndex(
			(candidate, index) =>
				index > cursor && (cursor < 0 || index <= cursor + 10) && candidate === token
		);
		if (next < 0) return false;
		cursor = next;
	}
	return true;
}

// --- 1. label→value binding (authoritative, hand-verified) ----------------

export interface BindingPair {
	label: string;
	value: string;
}

export interface BindingScore {
	sameLine: number;
	near: number;
	wrong: number;
	missing: number;
	total: number;
	failures: string[];
}

const VALUE_PATTERN =
	/\b\d{1,3}(?:[\u00a0\u202f\u2009 ]\d{3})*(?:,\d{1,2})?\s?(?:€|%)|\bgratuit\b|\bnous consulter\b|\bfrais reels\b|\boffert\b/gi;

/** Words too generic to count as naming a value (units, prepositions). */
const FILLER =
	/^(?:an|mois|par|euro|euros|gratuit|soit|pour|information|trimestre|jour|operation|retrait|virement|alerte|dont|ttc|tva|hors|maxi|mini|puis|et|ou|le|la|les|de|du|des|au|aux|en|sur|avec|sans|une|un|est|a)$/i;

/**
 * Does each value stay attached to the thing it describes?
 *
 * `sameLine` the pair survives on one output line — the chunker cannot split it.
 * `near`     the value is within 25 tokens of the label, so both land in one chunk.
 * `wrong`    a *different* value sits closer to the label than the right one.
 *            This is the damaging failure: retrieval returns a confident,
 *            well-formed, incorrect answer.
 *
 * Proves: whether table structure survived. Cannot prove: reading order across
 * the page, or that nothing was dropped elsewhere.
 */
export function scoreBinding(pageText: string, pairs: BindingPair[]): BindingScore {
	const lines = pageText.split('\n').map(normalizeAmounts);
	const flat = normalizeAmounts(pageText);
	const tokens = flat.split(' ');
	const score: BindingScore = {
		sameLine: 0,
		near: 0,
		wrong: 0,
		missing: 0,
		total: pairs.length,
		failures: []
	};

	for (const { label, value } of pairs) {
		const needle = normalizeAmounts(label);
		const wanted = normalizeAmounts(value);

		if (lines.some((line) => line.includes(needle) && line.includes(wanted))) {
			score.sameLine++;
			score.near++;
			continue;
		}
		const needleTokens = needle.split(' ');
		let cursor = -1;
		for (let index = 0; index + needleTokens.length <= tokens.length; index++) {
			if (needleTokens.every((token, offset) => tokens[index + offset] === token)) {
				cursor = index + needleTokens.length;
				break;
			}
		}
		if (cursor < 0) {
			score.missing++;
			score.failures.push(`label absent: "${label}"`);
			continue;
		}
		const window = tokens.slice(cursor, cursor + 25).join(' ');
		if (window.includes(wanted)) {
			score.near++;
			continue;
		}
		const intruder = window.match(VALUE_PATTERN);
		if (intruder?.length) {
			score.wrong++;
			score.failures.push(`WRONG "${label}" → ${intruder[0].trim()} (truth ${value})`);
		} else {
			score.missing++;
			score.failures.push(`no value near "${label}" (truth ${value})`);
		}
	}
	return score;
}

// --- 2. orphan values (label-free, whole corpus) --------------------------

export interface OrphanScore {
	values: number;
	orphans: number;
}

/**
 * A value on an output line that carries no word capable of naming it.
 *
 * Needs no labels, so it runs over every page of every document and gives the
 * binding result a large-n sanity check. Direction only: a parser that never
 * breaks lines trivially wins this, which is exactly why it is reported beside
 * `wrong` from the hand-verified metric rather than instead of it.
 */
export function scoreOrphans(pageText: string): OrphanScore {
	let values = 0;
	let orphans = 0;
	for (const raw of pageText.split('\n')) {
		// A markdown table row binds by construction; split cells so each is
		// judged with its own row, which is what the chunker will see.
		const line = raw.replace(/\|/g, ' ');
		const found = line.match(VALUE_PATTERN);
		if (!found?.length) continue;
		values += found.length;
		const words = line
			.replace(VALUE_PATTERN, ' ')
			.split(/[^\p{L}]+/u)
			.filter((word) => word.length >= 4 && !FILLER.test(word));
		if (words.length === 0) orphans += found.length;
	}
	return { values, orphans };
}

// --- 3. reading order against publisher HTML ------------------------------

export interface OrderScore {
	segments: number;
	recall: number;
	contiguous: number;
	inOrder: number;
}

export function htmlToText(html: string): string {
	return (
		html
			// `</script >` is a valid end tag: HTML allows whitespace before the
			// closing bracket. A pattern that demands `</script>` exactly leaves the
			// script body in the text, and the tag stripper below then turns code
			// into words the benchmark scores as document content.
			.replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
			.replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			// One pass over every entity, so a decoded `&` can never be re-read as
			// the start of another entity: `&amp;lt;` is the literal text "&lt;",
			// and decoding in sequence turned it into "<".
			.replace(/&(?:nbsp|amp|lt|gt|quot|apos|#(\d+)|[a-z]+);/gi, (entity, code) => {
				if (code) return String.fromCharCode(Number(code));
				const named: Record<string, string> = {
					'&nbsp;': ' ',
					'&amp;': '&',
					'&lt;': '<',
					'&gt;': '>',
					'&quot;': '"',
					'&apos;': "'"
				};
				return named[entity.toLowerCase()] ?? ' ';
			})
			.replace(/\s+/g, ' ')
	);
}

/** Sentence-ish runs long enough that finding one is meaningful. */
export function groundTruthSegments(text: string): string[] {
	const segments: string[] = [];
	for (const raw of text.split(/(?<=[.;:])\s+/)) {
		const words = normalizeForFuzzy(raw).split(' ').filter(Boolean);
		if (words.length >= 8 && words.length <= 40) segments.push(words.slice(0, 20).join(' '));
	}
	return [...new Set(segments)];
}

/**
 * Compare a parse against the publisher's own HTML of the same act.
 *
 * `contiguous` is the real test: two-column interleaving leaves every word
 * present but shears the sentence, which passes recall and fails here.
 *
 * Proves: reading order and completeness on prose. Cannot prove: anything about
 * tables, where the HTML twin's own order is not the PDF's visual order.
 */
export function scoreOrder(parsedText: string, truth: string[]): OrderScore {
	const normalized = normalizeForFuzzy(parsedText);
	const tokens = normalized.split(' ');
	let recall = 0;
	let contiguous = 0;
	const positions: number[] = [];

	for (const segment of truth) {
		if (normalized.includes(segment)) {
			contiguous++;
			recall++;
			positions.push(normalized.indexOf(segment));
			continue;
		}
		const expected = segment.split(' ');
		let found = -1;
		for (let start = 0; start < tokens.length && found < 0; start++) {
			if (tokens[start] !== expected[0]) continue;
			let cursor = start;
			let ok = true;
			for (const token of expected.slice(1)) {
				const next = tokens.findIndex(
					(candidate, index) => index > cursor && index <= cursor + 10 && candidate === token
				);
				if (next < 0) {
					ok = false;
					break;
				}
				cursor = next;
			}
			if (ok) found = start;
		}
		if (found >= 0) {
			recall++;
			positions.push(found);
		}
	}
	let inOrder = 0;
	for (let index = 1; index < positions.length; index++)
		if (positions[index] > positions[index - 1]) inOrder++;
	return {
		segments: truth.length,
		recall,
		contiguous,
		inOrder: positions.length > 1 ? inOrder / (positions.length - 1) : 1
	};
}

// --- 4. cross-section contamination --------------------------------------

export interface SectionItem {
	item: string;
	section: string;
}

export interface SectionScore {
	total: number;
	clean: number;
	contaminated: number;
	absent: number;
	failures: string[];
}

/**
 * Does a statement ever share an output line with a statement from a different
 * section?
 *
 * An insurance IPID puts "what is covered" and "what is NOT covered" in two
 * boxes side by side. When a parse interleaves them, one output line carries a
 * covered peril and an exclusion at once, so the chunk built from it cannot
 * tell the model which is which. That is the most damaging failure this corpus
 * can express: the passage is real, the citation is real, and the answer is
 * inverted.
 *
 * Measured by co-occurrence rather than by "the last heading before the item",
 * because on every IPID in the corpus both parsers emit the two box headings on
 * a single line — the heading rows share a y coordinate. That makes any
 * heading-attribution rule ambiguous for both sides, while co-occurrence stays
 * exact.
 *
 * Proves: whether side-by-side columns were kept apart. Cannot prove: that the
 * surviving separation is labelled with the right heading.
 */
export function scoreSections(pageText: string, items: SectionItem[]): SectionScore {
	// A markdown table row is one chunk unit, so it is one line here. Items are
	// matched on their opening words because both parsers wrap and truncate long
	// statements mid-phrase, and a full-phrase match would silently miss those.
	const lines = pageText.split('\n').map(normalizeForFuzzy);
	const prefix = (text: string) => normalizeForFuzzy(text).split(' ').slice(0, 4).join(' ');
	const score: SectionScore = {
		total: items.length,
		clean: 0,
		contaminated: 0,
		absent: 0,
		failures: []
	};
	const needles = items.map((entry) => ({ ...entry, needle: prefix(entry.item) }));

	for (const entry of needles) {
		const host = lines.find((line) => line.includes(entry.needle));
		if (host === undefined) {
			score.absent++;
			score.failures.push(`item absent: "${entry.item}"`);
			continue;
		}
		const intruder = needles.find(
			(other) => other.section !== entry.section && host.includes(other.needle)
		);
		if (intruder) {
			score.contaminated++;
			score.failures.push(
				`MIXED "${entry.item}" (${entry.section}) shares a line with ` +
					`"${intruder.item}" (${intruder.section})`
			);
		} else score.clean++;
	}
	return score;
}

// --- 5. OCR triage --------------------------------------------------------

export interface TriageScore {
	pages: number;
	needing: number;
	falsePositive: number;
	falseNegative: number;
}

/**
 * Ground truth without labels: a text layer is usable when what it yields reads
 * as language. A 1969 scan's junk OCR ("r--, I_ / 0 / 1..I-I") scores near
 * zero; real prose scores well above the threshold. Pages with almost no text
 * at all are counted as needing OCR regardless.
 *
 * Proves: whether the router sends the right pages to OCR. In a browser both
 * errors cost: a false negative serves garbage as searchable text, a false
 * positive burns seconds of on-device OCR the user waits through.
 */
export function textLayerUsable(text: string): boolean {
	const tokens = text.split(/\s+/).filter(Boolean);
	if (tokens.length < 8) return false;
	const words = tokens.filter((token) => /^[\p{L}]{3,}$/u.test(token)).length;
	return words / tokens.length >= 0.35;
}

export function scoreTriage(pages: AdapterPage[], referenceText: string[]): TriageScore {
	const score: TriageScore = {
		pages: pages.length,
		needing: 0,
		falsePositive: 0,
		falseNegative: 0
	};
	for (let index = 0; index < pages.length; index++) {
		// Judge the text layer from the shared pdf.js extraction so every adapter
		// is scored against the same ground truth, not against its own output.
		const truth = !textLayerUsable(referenceText[index] ?? '');
		if (truth) score.needing++;
		if (pages[index].needsOcr && !truth) score.falsePositive++;
		if (!pages[index].needsOcr && truth) score.falseNegative++;
	}
	return score;
}
