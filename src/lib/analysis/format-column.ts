import type { ColumnAnswer } from './record-columns';
import { currencyScale } from './money';
import { en } from '$lib/i18n/en';
import { fr } from '$lib/i18n/fr';

type ColumnMessageKey = Extract<keyof typeof en, `column.${string}`>;

function copy(
	locale: 'fr' | 'en',
	key: ColumnMessageKey,
	params: Record<string, string | number>
): string {
	let value = (locale === 'fr' ? fr : en)[key];
	for (const [name, replacement] of Object.entries(params)) {
		value = value.replaceAll(`{${name}}`, String(replacement));
	}
	return value;
}

/**
 * State the column, the value and which row it came from.
 *
 * The column keeps the name the document gave it rather than a name of ours: the
 * reader can check the answer against the page, and a label we invented is the
 * first step towards reporting one column as another.
 */
export function formatColumnAnswer(
	answer: ColumnAnswer,
	locale: 'fr' | 'en'
): { text: string; calculation: string } {
	const language = locale === 'fr' ? 'fr-FR' : 'en-US';
	const value = new Intl.NumberFormat(language, {
		style: 'currency',
		currency: answer.currency
	}).format(answer.valueMinor / currencyScale(answer.currency));
	const date = answer.record.date
		? new Intl.DateTimeFormat(language).format(new Date(`${answer.record.date}T00:00:00`))
		: '';
	const text =
		answer.selector === 'typical'
			? copy(locale, 'column.typical', { label: answer.label, value, support: answer.support })
			: copy(locale, answer.selector === 'first' ? 'column.first' : 'column.last', {
					label: answer.label,
					value,
					date
				});
	return {
		text,
		calculation: copy(locale, 'column.calculation', {
			label: answer.label,
			considered: answer.considered
		})
	};
}
