import { HELP_TOPICS } from '$lib/help-topics';
import { CANONICAL_ORIGIN } from '$lib/links';
import type { RequestHandler } from './$types';

// Generated, not a static file, because a static one drifts the moment a guide is
// added — and the guides are the pages most likely to grow.
//
// Only the marketing pages are listed. The chat is behind a workspace that lives
// in the visitor's own browser, so there is nothing there for a crawler to see and
// nothing it could usefully rank; /auth and /dev have no business in an index.
//
// Every page is listed twice, once per language, each with the full set of
// alternates pointing at the other. That is the shape the specification asks for
// and the previous one could not honour: the locale used to be a query parameter,
// so the alternates were ?lang= URLs that every page self-canonicalized away, and
// Google folded French into English. The language is a path segment now, English at
// the root and French under /fr, so there are two real URLs to declare.
const ORIGIN = CANONICAL_ORIGIN;

const PATHS = [
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

const en = (path: string) => `${ORIGIN}${path}`;
const fr = (path: string) => `${ORIGIN}/fr${path === '/' ? '' : path}`;

const entry = (
	{ path, priority, changefreq }: { path: string; priority: string; changefreq: string },
	loc: string
) => `	<url>
		<loc>${loc}</loc>
		<changefreq>${changefreq}</changefreq>
		<priority>${priority}</priority>
		<xhtml:link rel="alternate" hreflang="en" href="${en(path)}" />
		<xhtml:link rel="alternate" hreflang="fr" href="${fr(path)}" />
		<xhtml:link rel="alternate" hreflang="x-default" href="${en(path)}" />
	</url>`;

export const GET: RequestHandler = () =>
	new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PATHS.flatMap((p) => [entry(p, en(p.path)), entry(p, fr(p.path))]).join('\n')}
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
