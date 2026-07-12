// Interface i18n (spec 016, R4): a deliberately tiny locale system — two
// dictionaries, a reactive t(), zero framework. User content is never
// translated; only the interface speaks FR/EN.

import { en } from './en';
import { fr } from './fr';
import { getLocalDb } from '$lib/local-db/client';

export type Locale = 'en' | 'fr';
export type MessageKey = keyof typeof en;

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, fr };

class I18nStore {
	locale = $state<Locale>('en');
	private loaded = false;

	async init(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		const auto: Locale = navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
		try {
			const { db } = await getLocalDb();
			const saved = await db.getSetting('locale');
			this.locale = saved === 'fr' || saved === 'en' ? saved : auto;
		} catch {
			this.locale = auto;
		}
	}

	async setLocale(locale: Locale): Promise<void> {
		this.locale = locale;
		const { db } = await getLocalDb();
		await db.setSetting('locale', locale);
	}
}

export const i18n = new I18nStore();

export function translate(
	locale: Locale,
	key: MessageKey,
	params?: Record<string, string | number>
): string {
	let msg = dictionaries[locale][key] ?? en[key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) msg = msg.replaceAll(`{${k}}`, String(v));
	}
	return msg;
}

/** Reactive translate: `t('key')` or `t('key', { n: 3 })` for {n} slots. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
	return translate(i18n.locale, key, params);
}
