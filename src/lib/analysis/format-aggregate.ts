import type { AggregateResult } from './aggregate';
import { currencyScale } from './money';
import { en } from '$lib/i18n/en';
import { fr } from '$lib/i18n/fr';

type AggregateMessageKey = Extract<keyof typeof en, `aggregate.${string}`>;

function copy(
	locale: 'fr' | 'en',
	key: AggregateMessageKey,
	params?: Record<string, string | number>
): string {
	let value = (locale === 'fr' ? fr : en)[key];
	for (const [name, replacement] of Object.entries(params ?? {})) {
		value = value.replaceAll(`{${name}}`, String(replacement));
	}
	return value;
}

function money(valueMinor: number, currency: string, locale: string): string {
	return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
		valueMinor / currencyScale(currency)
	);
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
		if (result.ambiguousRecords.length) {
			return {
				text: copy(locale, 'aggregate.ambiguous'),
				calculation: copy(locale, 'aggregate.ambiguousCalculation')
			};
		}
		return {
			text: copy(locale, 'aggregate.none'),
			calculation: copy(locale, 'aggregate.noneCalculation')
		};
	}
	const labels = result.groups.map((group) => money(group.valueMinor, group.currency, language));
	const citations = result.facts.map((_, index) => `[${index + 1}]`).join(' ');
	if (result.operation === 'count') {
		return {
			text: copy(locale, 'aggregate.count', { count: result.count, citations }),
			calculation: copy(locale, 'aggregate.countCalculation', { count: result.count })
		};
	}
	if (result.operation === 'list') {
		const values = result.facts.map(
			(fact, index) => `${money(fact.valueMinor, fact.currency, language)} [${index + 1}]`
		);
		return {
			text: copy(locale, 'aggregate.list', { values: values.join(', ') }),
			calculation: values.join(' · ')
		};
	}
	const operation = copy(locale, `aggregate.${result.operation}`);
	let text = `${operation} ${labels.join(locale === 'fr' ? ' et ' : ' and ')}. ${citations}`;
	if (result.ambiguousDocuments.length) {
		text += ` ${copy(locale, 'aggregate.excluded', {
			count: result.ambiguousDocuments.length
		})}`;
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
