// Answer a question about one column of a table row, in code.
//
// A 240-row schedule is not something to search through: the row is the data, so
// the answer is a query, not a retrieved passage. Both a 4B and a 9B model were
// measured reading the wrong column of a row that was in front of them — asked
// for the interest portion of the first instalment, both answered the instalment
// itself. Column identity has to be data, not inference.
//
// The column names come from the document's own header (see pdf-layout's header
// binding), never from a vocabulary of French banking terms: a table this code
// has never seen is answerable exactly as well as this one.

import { normalizeForFuzzy } from '$lib/pipeline/fuzzy';
import type { FinancialRecord, RecordColumn } from './financial-records';

/** Which row of the column the question is asking about. */
export type ColumnSelector = 'first' | 'last' | 'typical';

export interface ColumnAnswer {
	/** The column name as the document writes it. */
	label: string;
	/** The value as the document writes it, for citing verbatim. */
	literal: string;
	valueMinor: number;
	currency: string;
	selector: ColumnSelector;
	/** The row the value came from, so the answer can cite it. */
	record: FinancialRecord;
	/** For 'typical', how many rows carry this same value. */
	support: number;
	/** Rows considered, so an answer can say what it looked at. */
	considered: number;
}

const SELECTORS: Array<[ColumnSelector, RegExp]> = [
	['first', /\b(?:premiere?|premier|1er|1re|first|initiale?)\b/u],
	['last', /\b(?:derniere?|dernier|final|finale|last)\b/u],
	['typical', /\b(?:courante?|habituelle?|normale?|typique|reguliere?|usual|typical|regular)\b/u]
];

/** Words that appear in almost every French column label and so cannot
 * discriminate between two of them. */
const LABEL_NOISE = new Set([
	'de',
	'du',
	'des',
	'la',
	'le',
	'les',
	'a',
	'au',
	'aux',
	'en',
	'et',
	'montant',
	'valeur',
	'total',
	'n',
	'no',
	'num',
	'numero'
]);

/**
 * Ordinary French words for a table's rows, mapped to the words a document's
 * header is likely to use. Vocabulary only — the same kind of synonym the
 * retrieval layer already expands — never a value, and never a rule about which
 * column holds the answer.
 */
const COLUMN_SYNONYMS: Record<string, string[]> = {
	mensualite: ['echeance'],
	mensualites: ['echeance'],
	traite: ['echeance'],
	interet: ['interets'],
	solde: ['restant'],
	principal: ['amorti']
};
// Deliberately absent: "remboursement". It belongs to the same domain as the
// instalment column without being a synonym of it, so mapping the two made
// "pénalité de remboursement anticipé" — a fact the table does not hold —
// resolve to the instalment column. A synonym has to name the column, not the
// subject.

function distinctiveTokens(text: string): string[] {
	return normalizeForFuzzy(text)
		.split(' ')
		.filter((token) => token.length >= 3 && !LABEL_NOISE.has(token));
}

function expandAsked(tokens: string[]): Set<string> {
	return new Set(tokens.flatMap((token) => [token, ...(COLUMN_SYNONYMS[token] ?? [])]));
}

/** Tokens the question uses to point at a ROW rather than at a column: the noun
 * sitting either side of an ordinal. In "part d'intérêts de la première
 * échéance" the column asked for is the interest, and "échéance" only names
 * which row — reading it as the column is how a row reference becomes a wrong
 * answer. */
function rowNouns(normalized: string): Set<string> {
	// The full word list, function words included: adjacency has to be measured
	// in the sentence, not in the filtered list, or "d'intérêts de la première
	// échéance" reads as though "intérêts" sat next to the ordinal.
	const words = normalized.split(' ');
	const meaningful = (word: string) => word.length >= 3 && !LABEL_NOISE.has(word);
	const nouns = new Set<string>();
	for (let index = 0; index < words.length; index++) {
		const kind = SELECTORS.find(([, pattern]) => pattern.test(words[index]))?.[0];
		if (!kind) continue;
		// French puts an ordinal before the noun it counts ("première échéance")
		// and a frequency adjective after it ("mensualité courante").
		const step = kind === 'typical' ? -1 : 1;
		for (let cursor = index + step; cursor >= 0 && cursor < words.length; cursor += step) {
			if (!meaningful(words[cursor])) continue;
			nouns.add(words[cursor]);
			break;
		}
	}
	return nouns;
}

export function selectorFor(question: string): ColumnSelector | null {
	const normalized = normalizeForFuzzy(question);
	for (const [selector, pattern] of SELECTORS) if (pattern.test(normalized)) return selector;
	return null;
}

/**
 * The column the question names, or null when no single column clearly matches.
 *
 * Refusing is the point. The two worst failures measured on this corpus were
 * both relabellings — an interest column reported as a borrower-insurance
 * schedule, a nominal rate reported as a TAEG — so a question naming something
 * the table does not contain must find nothing rather than the nearest column.
 */
export function matchColumnLabel(question: string, labels: string[]): string | null {
	const tokens = distinctiveTokens(question);
	if (!tokens.length) return null;
	const nouns = rowNouns(normalizeForFuzzy(question));

	const winner = (asked: Set<string>): string | null => {
		if (!asked.size) return null;
		const scored = labels.map((label) => {
			const labelTokens = distinctiveTokens(label);
			const matched = labelTokens.filter((token) =>
				[...asked].some(
					(word) => word === token || word.startsWith(token) || token.startsWith(word)
				)
			).length;
			return { label, matched };
		});
		const best = [...scored].sort((left, right) => right.matched - left.matched)[0];
		if (!best || best.matched === 0) return null;
		// An ambiguous question must not pick a winner by coin toss.
		return scored.filter((entry) => entry.matched === best.matched).length > 1 ? null : best.label;
	};

	// A column named outright wins over the noun that merely says which row.
	// Only when nothing else matches does the row noun get to name the column,
	// which is what makes "la dernière échéance" mean the instalment column.
	return (
		winner(expandAsked(tokens.filter((token) => !nouns.has(token)))) ?? winner(expandAsked(tokens))
	);
}

function columnOf(record: FinancialRecord, label: string): RecordColumn | undefined {
	return record.columns?.find((column) => column.label === label);
}

/**
 * The value of a named column, for the row the question points at.
 *
 * Returns null whenever anything is unclear — no selector, no matching column,
 * no dated rows — because a wrong number here is indistinguishable from a right
 * one to the person reading it.
 */
export function answerRecordColumn(
	question: string,
	records: FinancialRecord[]
): ColumnAnswer | null {
	const withColumns = records.filter((record) => record.columns?.length && record.date);
	if (withColumns.length < 3) return null;

	const selector = selectorFor(question);
	if (!selector) return null;

	const labels = [...new Set(withColumns.flatMap((record) => record.columns!.map((c) => c.label)))];
	const label = matchColumnLabel(question, labels);
	if (!label) return null;

	const ordered = [...withColumns].sort((left, right) => (left.date! < right.date! ? -1 : 1));
	const present = ordered.filter((record) => columnOf(record, label));
	if (present.length < 3) return null;

	if (selector === 'first' || selector === 'last') {
		const record = selector === 'first' ? present[0] : present[present.length - 1];
		const column = columnOf(record, label)!;
		return {
			label,
			literal: column.literal,
			valueMinor: column.valueMinor,
			currency: column.currency,
			selector,
			record,
			support: 1,
			considered: present.length
		};
	}

	// The recurring value. A French schedule prorates its first instalment and can
	// balloon its last, so both extremes are excluded before asking what is
	// typical — taking row 1 is exactly the error both models made.
	const middle = present.slice(1, -1);
	if (!middle.length) return null;
	const counts = new Map<number, { count: number; record: FinancialRecord }>();
	for (const record of middle) {
		const column = columnOf(record, label)!;
		const entry = counts.get(column.valueMinor) ?? { count: 0, record };
		entry.count++;
		counts.set(column.valueMinor, entry);
	}
	const [valueMinor, winner] = [...counts].sort((left, right) => right[1].count - left[1].count)[0];
	// A column that never repeats has no typical value; saying one would invent it.
	if (winner.count < Math.max(2, Math.ceil(middle.length * 0.25))) return null;
	const column = columnOf(winner.record, label)!;
	return {
		label,
		literal: column.literal,
		valueMinor,
		currency: column.currency,
		selector,
		record: winner.record,
		support: winner.count,
		considered: middle.length
	};
}
