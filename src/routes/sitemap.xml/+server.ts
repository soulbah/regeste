import { HELP_TOPICS } from '$lib/help-topics';
import type { RequestHandler } from './$types';

// Generated, not a static file, because a static one drifts the moment a guide is
// added — and the guides are the pages most likely to grow.
//
// Only the marketing pages are listed. The chat is behind a workspace that lives
// in the visitor's own browser, so there is nothing there for a crawler to see and
// nothing it could usefully rank; /auth and /dev have no business in an index.
//
// Both languages are declared as alternates. These pages serve whichever language
// the visitor's browser asks for at the same URL, and ?lang= overrides it, so the
// bare path is the x-default and the two query forms are the localized URLs — the
// only shape that lets a search engine offer a French reader the French page.
const ORIGIN = 'https://regeste.com';

const PAGES = [
	{ path: '/', priority: '1.0', changefreq: 'weekly' },
	{ path: '/how-it-works', priority: '0.8', changefreq: 'monthly' },
	{ path: '/help', priority: '0.7', changefreq: 'monthly' },
	{ path: '/privacy', priority: '0.5', changefreq: 'yearly' },
	...HELP_TOPICS.map((topic) => ({
		path: `/help/${topic.id}`,
		priority: '0.6',
		changefreq: 'monthly'
	}))
];

const entry = ({
	path,
	priority,
	changefreq
}: {
	path: string;
	priority: string;
	changefreq: string;
}) => `	<url>
		<loc>${ORIGIN}${path}</loc>
		<changefreq>${changefreq}</changefreq>
		<priority>${priority}</priority>
		<xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}${path}?lang=en" />
		<xhtml:link rel="alternate" hreflang="fr" href="${ORIGIN}${path}?lang=fr" />
		<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${path}" />
	</url>`;

export const GET: RequestHandler = () =>
	new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map(entry).join('\n')}
</urlset>
`,
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				// An hour: long enough that crawlers are not re-fetching it constantly,
				// short enough that a new guide appears the same day it ships.
				'cache-control': 'public, max-age=3600'
			}
		}
	);
