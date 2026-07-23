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
	// Inline markers were designed for a handful of statement records; a
	// 240-row schedule turns the answer into a wall of citations (and markers
	// past [99] don't even resolve). Past a small cap the text says how many
	// values were counted instead — the sources strip and the what-AI-saw
	// panel still carry every row.
	const INLINE_CITATION_CAP = 8;
	const compact = result.facts.length > INLINE_CITATION_CAP;
	const citations = compact
		? copy(locale, 'aggregate.overValues', { count: result.facts.length })
		: result.facts.map((_, index) => `[${index + 1}]`).join(' ');
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
		const shown = compact
			? `${values.slice(0, INLINE_CITATION_CAP).join(', ')}, … (${copy(locale, 'aggregate.overValues', { count: values.length })})`
			: values.join(', ');
		return {
			text: copy(locale, 'aggregate.list', { values: shown }),
			calculation: shown
		};
	}
	const operation = copy(locale, `aggregate.${result.operation}`);
	let text = compact
		? `${operation} ${labels.join(locale === 'fr' ? ' et ' : ' and ')} (${citations}).`
		: `${operation} ${labels.join(locale === 'fr' ? ' et ' : ' and ')}. ${citations}`;
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
			const shown =
				values.length <= 12
					? values
					: [
							...values.slice(0, 3),
							`… (${copy(locale, 'aggregate.overValues', { count: values.length })})`
						];
			return result.operation === 'sum'
				? `${shown.join(' + ')} = ${money(group.valueMinor, group.currency, language)}`
				: `${result.operation}(${shown.join(', ')}) = ${labels[result.groups.indexOf(group)]}`;
		})
		.join(' · ');
	return { text, calculation };
}
