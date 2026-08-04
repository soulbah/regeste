// The numbers a document or an answer states, read as values rather than as
// digit strings.
//
// Two callers need to agree on this and used to disagree: the benchmark oracle
// matched gold answers with a proper number grammar while the runtime guard and
// the citation binder used `\d[\d\s.,]*\d`, whose `\s` also matches a newline.
// A table flattened to text puts one figure per line, so "180,00\n0,00" became
// the single token "1800000". An answer stating "180,00 euros" then found no
// support for a figure printed right there in its evidence, and the guard
// refused a correct answer. One grammar, one canonical form, one module.

/** Space, no-break space and narrow no-break space are all used as a thousands
 * separator in French typography, and a PDF picks whichever it likes. */
const THOUSANDS_SEPARATOR = '[\\u0020\\u00a0\\u202f]';

/**
 * One value at a time, in the order a French document writes them, and never
 * across a line or a column break.
 *
 * Treating every digit, space, dot and comma as one run made a table row
 * collapse into a single number: "1 05.11.2025 14 949,07 69,39 50,93 18,46"
 * became one 24-digit token, so no individual cell was ever visible. The
 * alternatives below are ordered so a date wins over a decimal, and a thousands
 * group only continues on exactly three digits, which is what separates
 * "14 949,07 69,39" (two amounts) from "0801 840 506" (one phone number).
 */
export const NUMBER_RUN = new RegExp(
	[
		String.raw`\d{1,4}[./-]\d{1,2}[./-]\d{2,4}`, // 05.11.2025, 12/03/1994
		String.raw`\d{1,2}[:h]\d{2}`, // 09:30, 9h30
		String.raw`\d{1,3}(?:,\d{3}){2,}`, // 6,420,536 (unambiguous grouped integer)
		String.raw`\d{1,3}(?:${THOUSANDS_SEPARATOR}\d{3})*[.,]\d+`, // 14 949,07 and 69,39
		String.raw`\d{1,4}(?:${THOUSANDS_SEPARATOR}\d{3})+`, // 0801 840 506 and 15 000
		String.raw`\d+`
	].join('|'),
	'gu'
);

const DATE_OR_TIME = /^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}$|^\d{1,2}[:h]\d{2}$/u;

/** A run whose separators are not decimal points, so its digits denote a
 * calendar position rather than a quantity you can do arithmetic with. */
export function isDateOrTime(run: string): boolean {
	return DATE_OR_TIME.test(run);
}

/**
 * The value a run denotes, not the digits it happens to be written with.
 * "15 000,00" and "15 000" are the same amount, and so are "1,9900" and "1,99";
 * comparing digit strings made those three pairs mismatch, which fails an
 * oracle on a document that writes its amounts with cents and its rates with
 * four decimals. Dates and times keep their digits: their separators are not
 * decimal points and their trailing zeros are significant.
 */
export function canonicalNumber(run: string): string {
	if (DATE_OR_TIME.test(run)) return run.replace(/\D/gu, '');
	if (/^\d{1,3}(?:,\d{3}){2,}$/u.test(run)) return run.replace(/\D/gu, '');
	const decimal = /^(.*)[.,](\d+)$/u.exec(run);
	if (!decimal) return run.replace(/\D/gu, '');
	const fraction = decimal[2].replace(/0+$/u, '');
	const whole = decimal[1].replace(/\D/gu, '');
	return fraction ? `${whole}.${fraction}` : whole;
}

/** Every number a text states, canonicalised, in order of appearance. */
export function canonicalNumbers(text: string): string[] {
	return (text.match(NUMBER_RUN) ?? []).map(canonicalNumber);
}

/** The quantities a text states, as values you can compute with. Dates and
 * times are left out: their digits are a position on a calendar. */
export function numericValues(text: string): number[] {
	return (text.match(NUMBER_RUN) ?? [])
		.filter((run) => !isDateOrTime(run))
		.map((run) => Number(canonicalNumber(run)))
		.filter((value) => Number.isFinite(value));
}

/** A money amount as a document prints it: digits, thousands separators, and a
 * currency mark. Spaces and tabs may separate a thousands group ("20 00 € HT"),
 * but a line break never joins two cells: a flattened table row ends where the
 * currency mark is. Token shape, not vocabulary: the currency list is a closed
 * set of symbols. */
export const MONEY_AMOUNT =
	/(?:\d[\d \t.,]*[ \t]*(?:€|eur\b|euros?\b|usd\b|dollars?\b))(?:[ \t]*(?:ht|ttc))?/giu;

/**
 * The one value an amount literal denotes, canonicalised.
 *
 * `NUMBER_RUN` deliberately reads "20 00" as two runs: a two-digit group is
 * not a thousands group, and table rows must not collapse into one number.
 * But inside an amount the grammar already proved is money ("20 00 € HT"),
 * every digit belongs to the same value, so the canonical form joins them:
 * "20 00 € HT" and "2000 € HT" are the same amount. The last separator is a
 * decimal point; earlier ones are grouping.
 */
export function canonicalAmounts(literal: string): string[] {
	const match = /\d[\d\s.,]*/u.exec(literal);
	if (!match) return [];
	const raw = match[0].trim();
	const decimalAt = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
	let normalized: string;
	if (decimalAt >= 0) {
		const whole = raw.slice(0, decimalAt).replace(/[\s.,]/gu, '');
		const fraction = raw.slice(decimalAt + 1).replace(/[\s.,]/gu, '');
		// A fractional part of all zeros is the same value as the whole part:
		// "190,00 €" and "190 €" denote the same amount.
		normalized = /\d*[1-9]\d*/u.test(fraction) ? `${whole}.${fraction}` : whole;
	} else {
		normalized = raw.replace(/[\s.,]/gu, '');
	}
	if (normalized.includes('.')) normalized = normalized.replace(/0+$/u, '');
	return normalized ? [normalized] : [];
}

/** Money literals as a model should read them. A document may print
 * "20 00 € HT" — a space inside the thousands group, where a standard French
 * grouping would be "2 000" — and a small model reading that verbatim states
 * "20 000 € HT". Only non-standard integer groupings are joined: "20 00" is a
 * digit-group token shape that cannot denote a printed French amount, while
 * "40 000 €" and "5 000 €" are standard and stay exactly as printed, so
 * extractive answers keep the document's own formatting. The decimal fraction
 * is never touched. */
export function normalizeAmountsForModel(text: string): string {
	return text.replace(MONEY_AMOUNT, (literal) => {
		const digits = /\d[\d\s.,]*/u.exec(literal)?.[0].trim() ?? '';
		const decimalAt = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
		const integer = decimalAt >= 0 ? digits.slice(0, decimalAt) : digits;
		const fraction = decimalAt >= 0 ? digits.slice(decimalAt) : '';
		const suffix = literal.replace(/^[\d\s.,]+/u, '').trim();
		const groups = integer.split(/[\s.]/u).filter(Boolean);
		const standardGrouping =
			groups.length > 1 &&
			groups[groups.length - 1].length === 3 &&
			groups[0].length <= 3 &&
			groups.slice(1, -1).every((group) => group.length === 3);
		const joined = standardGrouping ? integer : integer.replace(/[\s.]/gu, '');
		return `${joined}${fraction} ${suffix}`.trim();
	});
}

export interface CalendarDateMention {
	start: number;
	end: number;
	/** ISO candidates. Ambiguous numeric dates carry both valid day/month orders. */
	keys: string[];
}

// Month names are a closed calendar token type, not an extensible domain vocabulary.
const CALENDAR_MONTHS: Record<string, number> = {
	janvier: 1,
	january: 1,
	fevrier: 2,
	february: 2,
	mars: 3,
	march: 3,
	avril: 4,
	april: 4,
	mai: 5,
	may: 5,
	juin: 6,
	june: 6,
	juillet: 7,
	july: 7,
	aout: 8,
	august: 8,
	septembre: 9,
	september: 9,
	octobre: 10,
	october: 10,
	novembre: 11,
	november: 11,
	decembre: 12,
	december: 12
};

function calendarToken(value: string): string {
	return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

function isoDate(day: number, month: number, year: number): string | null {
	if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Calendar mentions with canonical candidates, independent of surface format. */
export function calendarDateMentions(text: string): CalendarDateMention[] {
	const mentions: CalendarDateMention[] = [];
	const add = (match: RegExpMatchArray, keys: Array<string | null>) => {
		const start = match.index ?? 0;
		const valid = [...new Set(keys.filter((key): key is string => key !== null))];
		if (!valid.length) return;
		mentions.push({ start, end: start + match[0].length, keys: valid });
	};

	for (const match of text.matchAll(/\b(\d{1,4})[./-](\d{1,2})[./-](\d{2,4})\b/gu)) {
		const first = Number(match[1]);
		const second = Number(match[2]);
		const third = Number(match[3]);
		if (match[1].length === 4) add(match, [isoDate(third, second, first)]);
		else {
			const year = match[3].length === 2 ? 2000 + third : third;
			add(match, [isoDate(first, second, year), isoDate(second, first, year)]);
		}
	}
	for (const match of text.matchAll(/\b(\d{1,2})(?:er|re|e|eme|ème)?\s+(\p{L}+)\s+(\d{4})\b/giu)) {
		const month = CALENDAR_MONTHS[calendarToken(match[2])];
		if (month) add(match, [isoDate(Number(match[1]), month, Number(match[3]))]);
	}
	for (const match of text.matchAll(
		/\b(\p{L}+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(\d{4})\b/giu
	)) {
		const month = CALENDAR_MONTHS[calendarToken(match[1])];
		if (month) add(match, [isoDate(Number(match[2]), month, Number(match[3]))]);
	}
	return mentions.filter(
		(mention, index, all) =>
			all.findIndex(
				(candidate) => candidate.start === mention.start && candidate.end === mention.end
			) === index
	);
}
