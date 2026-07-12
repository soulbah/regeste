export type MoneyKind = 'total_ttc' | 'total' | 'subtotal' | 'tax';

export interface MoneyCandidate {
	valueMinor: number;
	currency: string;
	kind: MoneyKind;
	label: string;
	confidence: number;
}

const AMOUNT = /(?:\(|[-−])?\d+(?:[\s\u00a0\u202f.,]\d{3})*(?:[.,]\d{2})?\)?/g;

function parseMinor(raw: string): number | null {
	const negative = raw.includes('-') || raw.includes('−') || raw.trimStart().startsWith('(');
	let value = raw.replace(/[()\-−\s\u00a0\u202f]/g, '');
	const comma = value.lastIndexOf(',');
	const dot = value.lastIndexOf('.');
	const decimalAt = Math.max(comma, dot);
	if (decimalAt >= 0 && value.length - decimalAt - 1 === 2) {
		value = value.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + value.slice(decimalAt + 1);
	} else {
		value = value.replace(/[.,]/g, '');
	}
	const number = Number(value);
	if (!Number.isFinite(number)) return null;
	return Math.round(number * 100) * (negative ? -1 : 1);
}

function currencyNear(text: string): string | null {
	if (/€|\bEUR\b/i.test(text)) return 'EUR';
	if (/\$|\bUSD\b/i.test(text)) return 'USD';
	if (/£|\bGBP\b/i.test(text)) return 'GBP';
	if (/\bCHF\b/i.test(text)) return 'CHF';
	return null;
}

function kindFromLabel(label: string): MoneyKind | null {
	if (/\b(ttc|net [àa] payer|amount due|total due|grand total)\b/i.test(label)) return 'total_ttc';
	if (/\b(total ht|sous[- ]?total|subtotal)\b/i.test(label)) return 'subtotal';
	if (/\b(tva|vat|taxe?|tax)\b/i.test(label)) return 'tax';
	if (/\b(total|montant)\b/i.test(label)) return 'total';
	return null;
}

export function requestedMoneyKind(question: string): MoneyKind | null {
	if (/\b(ttc|net [àa] payer|amount due|total due|grand total)\b/i.test(question))
		return 'total_ttc';
	if (/\b(ht|hors taxe|subtotal|before tax)\b/i.test(question)) return 'subtotal';
	if (/\b(tva|vat|taxe?|tax)\b/i.test(question)) return 'tax';
	return null;
}

export function extractMoneyCandidates(text: string): MoneyCandidate[] {
	const found: MoneyCandidate[] = [];
	for (const line of text.split('\n')) {
		for (const match of line.matchAll(AMOUNT)) {
			const index = match.index ?? 0;
			const label = line.slice(Math.max(0, index - 55), index).trim();
			const kind = kindFromLabel(label);
			if (!kind) continue;
			const currency = currencyNear(
				line.slice(Math.max(0, index - 20), index + match[0].length + 20)
			);
			const valueMinor = parseMinor(match[0]);
			if (!currency || valueMinor === null) continue;
			found.push({
				valueMinor,
				currency,
				kind,
				label: label.slice(-55),
				confidence: kind === 'total_ttc' ? 0.98 : kind === 'total' ? 0.9 : 0.85
			});
		}
	}
	return found.filter(
		(candidate, index, all) =>
			all.findIndex(
				(other) =>
					other.valueMinor === candidate.valueMinor &&
					other.currency === candidate.currency &&
					other.kind === candidate.kind
			) === index
	);
}
