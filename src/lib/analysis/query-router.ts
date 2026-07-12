import type { QuestionRoute } from '$lib/types';

const AGGREGATE =
	/\b(somme|additionne|total(?:e|iser)?|moyenne|minimum|maximum|combien au total|sum|average|minimum|maximum|count)\b/i;
const EXHAUSTIVE =
	/\b(tou(?:s|tes)|ensemble|documents|factures|envoy[ée]s|jointes|all|across|invoices|attached)\b/i;
const SYNTHESIS =
	/\b(compare|comparaison|diff[ée]rences?|synth[èe]se|résum[ée] global|en commun|contradictions?|compare|comparison|differences?|synthesize|overall summary|contradictions?)\b/i;

export function routeQuestion(question: string): QuestionRoute {
	if (AGGREGATE.test(question) && EXHAUSTIVE.test(question)) return 'aggregate';
	if (SYNTHESIS.test(question)) return 'synthesis';
	return 'targeted';
}

export function questionLocale(question: string): 'fr' | 'en' {
	if (
		/\b(quel(?:le)?|somme|toutes?|factures?|montants?|combien|moyenne|documents? joints?)\b/i.test(
			question
		)
	) {
		return 'fr';
	}
	return 'en';
}
