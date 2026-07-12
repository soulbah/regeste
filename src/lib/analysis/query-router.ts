import type { QuestionRoute } from '$lib/types';

export type AggregateOperation = 'sum' | 'average' | 'minimum' | 'maximum' | 'count' | 'list';

export interface TemporalScope {
	start: string | null;
	end: string | null;
	month: number | null;
	year: number | null;
}

export interface QuestionAnalysis {
	route: QuestionRoute;
	operation: AggregateOperation | null;
	moneyRole: 'sent' | 'received' | 'fee' | 'debited' | 'total_ttc' | 'subtotal' | 'tax' | null;
	temporal: TemporalScope | null;
	exhaustive: boolean;
}

const MONTHS: Record<string, number> = {
	janvier: 1,
	jan: 1,
	january: 1,
	february: 2,
	feb: 2,
	fevrier: 2,
	fevr: 2,
	mars: 3,
	march: 3,
	mar: 3,
	avril: 4,
	avr: 4,
	april: 4,
	apr: 4,
	mai: 5,
	may: 5,
	juin: 6,
	june: 6,
	juillet: 7,
	juil: 7,
	july: 7,
	aout: 8,
	august: 8,
	aug: 8,
	septembre: 9,
	sept: 9,
	september: 9,
	sep: 9,
	octobre: 10,
	oct: 10,
	october: 10,
	novembre: 11,
	nov: 11,
	november: 11,
	decembre: 12,
	dec: 12,
	december: 12
};

export function normalizeQuestion(text: string): string {
	return text
		.toLocaleLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[’']/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function isoDate(day: string, month: string, year: string): string | null {
	const d = Number(day);
	const m = Number(month);
	const y = Number(year);
	if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
	return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseNumericDate(value: string): string | null {
	const match = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(value);
	return match ? isoDate(match[1], match[2], match[3]) : null;
}

/** Parse bounded calendar scopes only. No relative dates: documents may be old. */
export function parseTemporalScope(question: string): TemporalScope | null {
	const q = normalizeQuestion(question);
	const range =
		/(?:du|from)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\s+(?:au|to)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/.exec(
			q
		);
	if (range) {
		const start = parseNumericDate(range[1]);
		const end = parseNumericDate(range[2]);
		if (start && end) return { start, end, month: null, year: null };
	}
	const exact = parseNumericDate(q);
	if (exact) return { start: exact, end: exact, month: null, year: null };
	const monthMatches = Object.entries(MONTHS)
		.map(([name, month]) => {
			const match = new RegExp(`\\b${name}\\b(?:\\s+(\\d{4}))?`).exec(q);
			return match ? { index: match.index, month, year: match[1] ? Number(match[1]) : null } : null;
		})
		.filter(
			(match): match is { index: number; month: number; year: number | null } => match !== null
		)
		.sort((a, b) => a.index - b.index);
	if (monthMatches[0]) {
		return { start: null, end: null, month: monthMatches[0].month, year: monthMatches[0].year };
	}
	const year = /\b(20\d{2})\b/.exec(q);
	return year ? { start: null, end: null, month: null, year: Number(year[1]) } : null;
}

function aggregateOperation(q: string): AggregateOperation | null {
	if (/\b(moyen|moyenne|average|mean)\b/.test(q)) return 'average';
	if (/\b(minimum|minimale?|plus petit|plus faible|lowest|smallest|minimum)\b/.test(q))
		return 'minimum';
	if (/\b(maximum|maximale?|plus grand|plus eleve|highest|largest|maximum)\b/.test(q))
		return 'maximum';
	if (/\b(combien de|nombre de|how many|count)\b/.test(q)) return 'count';
	if (
		/\b(liste|lister|detaille|detaillez|chaque|quels sont|quelles sont|list|each|what are|what were)\b/.test(
			q
		)
	)
		return 'list';
	if (
		/\b(somme|additionne|additionnez|total(?:e|iser)?|combien.*(?:envoye|recu|debite|frais)|sum|total|how much)\b/.test(
			q
		)
	)
		return 'sum';
	return null;
}

function requestedMoneyRole(q: string): QuestionAnalysis['moneyRole'] {
	if (/\b(montant recu|recu(?:e|s)?|beneficiaire.*recu|received|beneficiary received)\b/.test(q))
		return 'received';
	if (/\b(frais|commission|fees?|charges?)\b/.test(q)) return 'fee';
	if (
		/\b(debite|debitee|debites|debitees|preleve|avec les frais|total paye|total charged|debited|including fees)\b/.test(
			q
		)
	)
		return 'debited';
	if (/\b(envoye|envoyee|envoyes|envoyees|transfere|transferes|sent|send|transferred)\b/.test(q))
		return 'sent';
	if (/\b(ttc|net a payer|amount due|total due|grand total)\b/.test(q)) return 'total_ttc';
	if (/\b(hors taxe|total ht|subtotal|before tax)\b/.test(q)) return 'subtotal';
	if (/\b(tva|vat|taxe|tax)\b/.test(q)) return 'tax';
	return null;
}

export function analyzeQuestion(question: string): QuestionAnalysis {
	const q = normalizeQuestion(question);
	const temporal = parseTemporalScope(q);
	const operation = aggregateOperation(q);
	const synthesis =
		/\b(compare|comparaison|differences?|synthese|resume global|en commun|contradictions?|identiques?|cite separement|preuves?|prouvent?|que sait[- ]on|portrait complet|toutes les informations|plusieurs sources|comparison|synthesize|overall summary|same|identical|separate citations?|evidence|complete profile|all information|across sources)\b/.test(
			q
		);
	const exhaustive =
		!!temporal ||
		/\b(tous|toutes|ensemble|chaque|documents|factures|transactions|transferts|jointes|all|across|each|every|invoices|transactions|transfers|attached)\b/.test(
			q
		);
	const intrinsicallyAggregate =
		operation === 'average' ||
		operation === 'minimum' ||
		operation === 'maximum' ||
		operation === 'count';
	return {
		route: synthesis
			? 'synthesis'
			: operation && (exhaustive || intrinsicallyAggregate)
				? 'aggregate'
				: 'targeted',
		operation,
		moneyRole: requestedMoneyRole(q),
		temporal,
		exhaustive
	};
}

export function routeQuestion(question: string): QuestionRoute {
	return analyzeQuestion(question).route;
}

export function questionLocale(question: string): 'fr' | 'en' {
	const q = normalizeQuestion(question);
	return /\b(que|quel|quelle|quels|quelles|somme|tous|toutes|factures|montants|combien|moyenne|documents|envoye|recu|frais|juin|mai)\b/.test(
		q
	)
		? 'fr'
		: 'en';
}
