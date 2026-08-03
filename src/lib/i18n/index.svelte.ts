// Interface i18n (spec 016, R4): a deliberately tiny locale system — two
// dictionaries, a reactive t(), zero framework. User content is never
// translated; only the interface speaks FR/EN.

import { en } from './en';
import { fr } from './fr';
import { getLocalDb } from '$lib/local-db/client';

export type Locale = 'en' | 'fr';
export type MessageKey = keyof typeof en;

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, fr };

/** The language this machine reads.
 *
 * Exported because the marketing pages have no switch to offer and no database
 * to consult: they answer the same question the app answers on first run, and
 * one rule beats two that agree until one is edited. Browser-only. */
export function browserLocale(): Locale {
	return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

class I18nStore {
	locale = $state<Locale>('en');
	private loaded = false;

	async init(preferredLocale?: Locale): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const { db } = await getLocalDb();
			const saved = await db.getSetting('locale');
			if (saved === 'fr' || saved === 'en') {
				this.locale = saved;
			} else {
				this.locale = preferredLocale ?? browserLocale();
				if (preferredLocale) await db.setSetting('locale', preferredLocale);
			}
		} catch {
			this.locale = preferredLocale ?? browserLocale();
		}
	}

	/** Browser-language detection alone: the landing localizes without opening
	 * the local database, whose lock belongs to the app. */
	initWithoutDb(): void {
		if (this.loaded) return;
		this.locale = browserLocale();
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
