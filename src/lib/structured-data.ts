// Schema.org payloads for the marketing pages.
//
// Kept out of the components because every one of them needs the same origin,
// the same author node and the same breadcrumb root, and four copies of that
// drift. Every string here comes from the dictionaries or from a file in the
// repo — none is written for the crawler's benefit, because a fact stated only in
// JSON-LD is a fact nobody maintains.
//
// What is deliberately absent, and why:
// - aggregateRating and Review: there is no review corpus. They are also the
//   properties that gate Google's star-and-price result for software, so its
//   absence is expected rather than a gap to fill later with invented ratings.
// - HowTo: deprecated as a rich result in 2023. TechArticle is the honest type
//   for a symptom-and-fix guide.
// - FAQPage: Google restricted its rich result to government and healthcare in
//   2023, and on a help page it would repeat the TechArticle body verbatim.
// - WebSite with SearchAction: there is no public search endpoint to point it at.
//   Document search runs on the reader's own machine, over their own files.
// - Organization: this is one person's project, not a company. WebApplication is
//   a creative-work type, so naming the software there claims nothing about a
//   legal entity, and the human is a Person throughout.
import { GITHUB } from '$lib/links';
import { HELP_TOPICS, type HelpTopic } from '$lib/help-topics';
import type { MessageKey } from '$lib/i18n/index.svelte';

/** The only public identity in the repo. A real name is the owner's to publish,
 * not this file's to assume. */
const AUTHOR = {
	'@type': 'Person',
	name: 'soulbah',
	url: 'https://github.com/soulbah'
} as const;

const LICENSE = 'https://www.gnu.org/licenses/agpl-3.0.html';

type Translate = (key: MessageKey) => string;

const app = (origin: string) => ({
	'@type': 'WebApplication',
	name: 'Regeste',
	url: `${origin}/`
});

function crumbs(origin: string, trail: { name: string; path: string }[]) {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: trail.map((step, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: step.name,
			item: `${origin}${step.path}`
		}))
	};
}

/** The home page. This is the block an answer engine quotes when asked what the
 * thing is, so its description is the hero's own subtitle rather than a second
 * pitch nobody proofreads. */
export function landingSchema(origin: string, t: Translate) {
	return {
		'@context': 'https://schema.org',
		...app(origin),
		description: t('landing.hero.sub'),
		// WebApplication rather than SoftwareApplication: schema.org's own subtype
		// for software that runs in a browser instead of being installed, which is
		// literally the case here.
		applicationCategory: 'BusinessApplication',
		operatingSystem: 'Any',
		inLanguage: ['en', 'fr'],
		image: `${origin}/icons/icon-512.png`,
		license: LICENSE,
		sameAs: [GITHUB],
		author: AUTHOR,
		// The three modes, in the words the page already uses for them.
		featureList: [t('landing.modes.private'), t('landing.modes.assisted'), t('landing.modes.myai')],
		// Required properties of Offer even when nothing changes hands. No
		// `availability`: that vocabulary is for stocked goods. The url points where
		// the free offer is actually taken up, since no pricing page exists.
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', url: `${origin}/chat` },
		isAccessibleForFree: true
	};
}

export function howItWorksSchema(origin: string, t: Translate, locale: string) {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			crumbs(origin, [
				{ name: 'Regeste', path: '/' },
				{ name: t('hiw.title'), path: '/how-it-works' }
			]),
			{
				'@type': 'WebPage',
				url: `${origin}/how-it-works`,
				name: t('hiw.title'),
				description: t('hiw.intro'),
				inLanguage: locale,
				isPartOf: app(origin)
			}
		]
	};
}

export function privacySchema(origin: string, t: Translate, locale: string) {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			crumbs(origin, [
				{ name: 'Regeste', path: '/' },
				{ name: t('policy.title'), path: '/privacy' }
			]),
			{
				'@type': 'WebPage',
				url: `${origin}/privacy`,
				name: t('policy.title'),
				description: t('policy.intro'),
				// The date the page itself prints, not one minted for the crawler.
				dateModified: '2026-07-30',
				inLanguage: locale,
				isPartOf: app(origin)
			}
		]
	};
}

export function helpIndexSchema(origin: string, t: Translate, locale: string) {
	return {
		'@context': 'https://schema.org',
		'@graph': [
			crumbs(origin, [
				{ name: 'Regeste', path: '/' },
				{ name: t('help.title'), path: '/help' }
			]),
			{
				'@type': 'CollectionPage',
				url: `${origin}/help`,
				name: t('help.title'),
				description: t('help.intro'),
				inLanguage: locale,
				isPartOf: app(origin),
				mainEntity: {
					'@type': 'ItemList',
					itemListElement: HELP_TOPICS.map((topic, i) => ({
						'@type': 'ListItem',
						position: i + 1,
						name: t(topic.title),
						url: `${origin}/help/${topic.id}`
					}))
				}
			}
		]
	};
}

/** One guide. Seven of these beat one long page: each answers a different query,
 * and the whole symptom-cause-fix text sits in articleBody where an answer engine
 * can lift it. */
export function helpTopicSchema(
	origin: string,
	topic: HelpTopic,
	t: Translate,
	locale: string,
	indexTitle: string
) {
	const url = `${origin}/help/${topic.id}`;
	return {
		'@context': 'https://schema.org',
		'@graph': [
			crumbs(origin, [
				{ name: 'Regeste', path: '/' },
				{ name: indexTitle, path: '/help' },
				{ name: t(topic.title), path: `/help/${topic.id}` }
			]),
			{
				'@type': 'TechArticle',
				mainEntityOfPage: url,
				url,
				headline: t(topic.title),
				description: t(topic.symptom),
				articleBody: [t(topic.cause), ...topic.fix.map((step) => t(step))].join(' '),
				proficiencyLevel: 'Beginner',
				inLanguage: locale,
				author: AUTHOR,
				publisher: AUTHOR,
				isPartOf: { '@type': 'CollectionPage', name: indexTitle, url: `${origin}/help` }
			}
		]
	};
}
