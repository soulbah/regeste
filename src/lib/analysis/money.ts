import { normalizeQuestion } from './query-router';

export type MoneyKind =
	'total_ttc' | 'total' | 'subtotal' | 'tax' | 'amount' | 'sent' | 'received' | 'fee' | 'debited';

export interface MoneyCandidate {
	valueMinor: number;
	currency: string;
	kind: MoneyKind;
	label: string;
	confidence: number;
	raw?: string;
}

const CURRENCIES: Record<string, string> = {
	'€': 'EUR',
	eur: 'EUR',
	$: 'USD',
	usd: 'USD',
	'£': 'GBP',
	gbp: 'GBP',
	chf: 'CHF',
	gnf: 'GNF'
};
const CURRENCY_PATTERN = '(?:EUR|USD|GBP|CHF|GNF|€|\\$|£)';
const AMOUNT_PATTERN = '(?:\\(|[-−])?\\d+(?:[\\s\\u00a0\\u202f.,]\\d+)*(?:\\))?';
const MONEY = new RegExp(
	`(?:(?<prefix>${CURRENCY_PATTERN})\\s*(?<prefixAmount>${AMOUNT_PATTERN})|(?<suffixAmount>${AMOUNT_PATTERN})\\s*(?<suffix>${CURRENCY_PATTERN}))`,
	'giu'
);

export function currencyFractionDigits(currency: string): number {
	return currency === 'GNF' ? 0 : 2;
}

export function currencyScale(currency: string): number {
	return 10 ** currencyFractionDigits(currency);
}

function parseMinor(raw: string, currency: string): number | null {
	const negative = raw.includes('-') || raw.includes('−') || raw.trimStart().startsWith('(');
	let value = raw.replace(/[()\-−\s\u00a0\u202f]/g, '');
	const fractionDigits = currencyFractionDigits(currency);
	const comma = value.lastIndexOf(',');
	const dot = value.lastIndexOf('.');
	const decimalAt = Math.max(comma, dot);
	if (fractionDigits > 0 && decimalAt >= 0 && value.length - decimalAt - 1 === fractionDigits) {
		value = value.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + value.slice(decimalAt + 1);
	} else {
		value = value.replace(/[.,]/g, '');
	}
	const number = Number(value);
	if (!Number.isFinite(number)) return null;
	return Math.round(number * currencyScale(currency)) * (negative ? -1 : 1);
}

function kindFromLabel(label: string): MoneyKind | null {
	const value = normalizeQuestion(label);
	if (
		/\b(montant recu|recu par|amount received|received amount|beneficiary receives?)\b/.test(value)
	)
		return 'received';
	if (/\b(frais|commission|fees?|charges?)\b/.test(value)) return 'fee';
	if (/\b(total debite|total preleve|total charged|debited total)\b/.test(value)) return 'debited';
	if (/\b(ttc|net a payer|amount due|total due|grand total)\b/.test(value)) return 'total_ttc';
	if (/\b(total ht|sous total|subtotal)\b/.test(value)) return 'subtotal';
	if (/\b(tva|vat|taxe|tax)\b/.test(value)) return 'tax';
	if (/\btotal\b/.test(value)) return 'total';
	if (/\b(montant|amount)\b/.test(value)) return 'amount';
	return null;
}

/** Parse only explicit value/currency pairs; proximity never changes currency ownership. */
export function extractMoneyCandidates(text: string): MoneyCandidate[] {
	const found: MoneyCandidate[] = [];
	const lines = text.split('\n');
	for (const [lineIndex, line] of lines.entries()) {
		let previousEnd = 0;
		for (const match of line.matchAll(MONEY)) {
			const groups = match.groups ?? {};
			const currencyToken = groups.prefix ?? groups.suffix;
			const raw = groups.prefixAmount ?? groups.suffixAmount;
			if (!currencyToken || !raw) continue;
			const currency = CURRENCIES[currencyToken.toLocaleLowerCase()] ?? CURRENCIES[currencyToken];
			if (!currency) continue;
			const amountOffset = match[0].indexOf(raw);
			const amountStart = (match.index ?? 0) + Math.max(0, amountOffset);
			const labelEnd = groups.prefix ? (match.index ?? 0) : amountStart;
			const label = line.slice(previousEnd, labelEnd).trim().slice(-80);
			const localKind = kindFromLabel(label);
			const wrappedKind = kindFromLabel(
				`${lines[lineIndex - 1] ?? ''} ${label} ${lines[lineIndex + 1] ?? ''}`.trim()
			);
			// Wrapped PDF columns can put "Montant reçu par le" before the
			// value row and "bénéficiaire" after it. Recover only that specific
			// role: borrowing a generic adjacent label would turn exchange-rate
			// values into fees/totals from the next row.
			const kind = localKind ?? (wrappedKind === 'received' ? wrappedKind : null);
			const valueMinor = parseMinor(raw, currency);
			if (kind && valueMinor !== null) {
				found.push({
					valueMinor,
					currency,
					kind,
					label,
					confidence: kind === 'total_ttc' ? 0.98 : kind === 'amount' ? 0.85 : 0.92,
					raw: `${raw} ${currencyToken}`.trim()
				});
			}
			previousEnd = (match.index ?? 0) + match[0].length;
		}
	}
	return found;
}
