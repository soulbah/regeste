import type { AggregateResult } from './aggregate';

function money(valueMinor: number, currency: string, locale: string): string {
	return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(valueMinor / 100);
}

export function formatAggregateResult(
	result: AggregateResult,
	locale: 'fr' | 'en'
): {
	text: string;
	calculation: string;
} {
	const language = locale === 'fr' ? 'fr-FR' : 'en-US';
	if (!result.facts.length) {
		return {
			text:
				locale === 'fr'
					? 'Je n’ai trouvé aucun montant suffisamment fiable à calculer dans les documents sélectionnés.'
					: 'I found no sufficiently reliable amount to calculate in the selected documents.',
			calculation: locale === 'fr' ? 'Aucun montant retenu' : 'No amount retained'
		};
	}
	const labels = result.groups.map((group) =>
		result.operation === 'count'
			? `${group.count}`
			: money(group.valueMinor, group.currency, language)
	);
	const citations = result.facts.map((_, index) => `[${index + 1}]`).join(' ');
	const operation =
		locale === 'fr'
			? {
					sum: 'La somme est',
					average: 'La moyenne est',
					minimum: 'Le minimum est',
					maximum: 'Le maximum est',
					count: 'Le nombre de montants est'
				}[result.operation]
			: {
					sum: 'The sum is',
					average: 'The average is',
					minimum: 'The minimum is',
					maximum: 'The maximum is',
					count: 'The number of amounts is'
				}[result.operation];
	let text = `${operation} ${labels.join(locale === 'fr' ? ' et ' : ' and ')}. ${citations}`;
	if (result.ambiguousDocuments.length) {
		text +=
			locale === 'fr'
				? ` ${result.ambiguousDocuments.length} document(s) ambigu(s) ont été exclus.`
				: ` ${result.ambiguousDocuments.length} ambiguous document(s) were excluded.`;
	}
	const calculation = result.groups
		.map((group) => {
			const values = result.facts
				.filter((fact) => fact.currency === group.currency)
				.map((fact) => money(fact.valueMinor, fact.currency, language));
			return result.operation === 'sum'
				? `${values.join(' + ')} = ${money(group.valueMinor, group.currency, language)}`
				: `${result.operation}(${values.join(', ')}) = ${labels[result.groups.indexOf(group)]}`;
		})
		.join(' · ');
	return { text, calculation };
}
