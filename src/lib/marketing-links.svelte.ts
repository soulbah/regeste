import { resolve } from '$app/paths';
import { i18n, type Locale } from '$lib/i18n/index.svelte';

// Every link from the app into the marketing pages, in one place, because they now
// carry a language segment and a forgotten one is not a broken link — it is worse.
//
// The marketing layout takes its locale from the path, so a reader in French who
// follows an unprefixed help link lands on the English page AND has the whole
// interface switched to English on the way back. Reading the current locale here
// means the caller cannot forget.
//
// English stays unprefixed: `lang: undefined` on an optional parameter resolves to
// the bare path, so /how-it-works keeps the URL it has always had.
// The locale is an argument so the language switch can ask for the other one
// without hand-building a path. Omitted, it means the one being read.
const seg = (locale?: Locale) => ((locale ?? i18n.locale) === 'fr' ? ('fr' as const) : undefined);

export function howItWorksHref(locale?: Locale): string {
	return resolve('/(marketing)/[[lang=lang]]/how-it-works', { lang: seg(locale) });
}

export function guidesHref(topic?: string, locale?: Locale): string {
	return resolve('/(marketing)/[[lang=lang]]/help/[[topic]]', { lang: seg(locale), topic });
}

export function privacyHref(locale?: Locale): string {
	return resolve('/(marketing)/[[lang=lang]]/privacy', { lang: seg(locale) });
}

export function landingHref(locale?: Locale): string {
	return resolve('/(marketing)/[[lang=lang]]', { lang: seg(locale) });
}
