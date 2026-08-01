import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { CSP_DIRECTIVES } from './src/lib/csp';
import { sveltekit } from '@sveltejs/kit/vite';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import fuzzyManifest from './benchmarks/fuzzy-corpus-manifest.json';
import type { Plugin } from 'vite';

const FUZZY_FIXTURE_PREFIX = '/dev/fuzzy-public/';
const PRIVATE_FIXTURE_PREFIX = '/dev/private-fixtures/';
const PARSER_AB_PREFIX = '/dev/parser-ab/';
// The owner's own documents. Not versioned, and the only French corpus that has
// ever caught a real defect, so the harness pages must be able to load it.
const OWNER_PREFIX = '/dev/owner/';
const fuzzyFixtureDirectory = resolve(import.meta.dirname, fuzzyManifest.outputDirectory);
const privateFixtureDirectory = resolve(import.meta.dirname, '.benchmark-corpus/private');
const parserAbDirectory = resolve(import.meta.dirname, '.benchmark-corpus/parser-ab');
const ownerDirectory = resolve(import.meta.dirname, '.benchmark-corpus/owner');
const fuzzyFixtureNames = new Set(fuzzyManifest.files.map((file) => file.name));

/** Public research fixtures are dev inputs, not deployable application assets.
 * Serve them from the ignored benchmark cache only while Vite is running.
 * Private local fixtures (never committed, never deployed) are exposed the
 * same way so the dev benchmark page can ingest them without manual upload.
 * The parser evaluation corpus joins them so the OCR A/B can rasterise a real
 * document in the browser, which is the only place the recogniser runs. */
function localBenchmarkFixtures(): Plugin {
	return {
		name: 'regeste-local-benchmark-fixtures',
		apply: 'serve' as const,
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				try {
					const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
					const prefix = [FUZZY_FIXTURE_PREFIX, PRIVATE_FIXTURE_PREFIX, PARSER_AB_PREFIX, OWNER_PREFIX].find(
						(candidate) => pathname.startsWith(candidate)
					);
					if (!prefix) return next();
					const directory = {
						[FUZZY_FIXTURE_PREFIX]: fuzzyFixtureDirectory,
						[PRIVATE_FIXTURE_PREFIX]: privateFixtureDirectory,
						[PARSER_AB_PREFIX]: parserAbDirectory,
						[OWNER_PREFIX]: ownerDirectory
					}[prefix]!;
					const name = decodeURIComponent(pathname.slice(prefix.length));
					if (name.includes('/') || name.includes('..')) return next();
					if (prefix === FUZZY_FIXTURE_PREFIX && !fuzzyFixtureNames.has(name)) return next();
					const path = resolve(directory, name);
					const metadata = await stat(path);
					res.statusCode = 200;
					res.setHeader('Content-Length', metadata.size);
					res.setHeader(
						'Content-Type',
						name.endsWith('.pdf') ? 'application/pdf' : 'text/plain; charset=utf-8'
					);
					res.setHeader('Cache-Control', 'no-store');
					createReadStream(path).on('error', next).pipe(res);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === 'ENOENT') return next();
					next(error);
				}
			});
		}
	};
}

export default defineConfig({
	plugins: [
		localBenchmarkFixtures(),
		tailwindcss(),
		sveltekit({
			// Inference Service Worker is production-only. Manual registration in
			// +layout keeps Vite HMR free from persistent worker lifecycle state.
			serviceWorker: { register: false },
			// Absolute asset URLs (spec 030). SvelteKit defaults to relative ones,
			// which resolve against the CURRENT path — so the single cached app
			// shell, served for every navigation, asked for /chat/<id>/_app/… and
			// 404'd on any sub-route refresh. Absolute paths make one shell valid
			// everywhere; the app is always served from the origin root.
			paths: { relative: false },
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Both languages are built. '*' covers every route without a required
			// parameter, which is English at the root; an optional parameter has no
			// value for a crawler to discover, so the French roots are named and the
			// topics under /fr/help are found from that index.
			prerender: { entries: ['*', '/fr', '/fr/how-it-works', '/fr/help', '/fr/privacy'] },

			// A content policy on a product whose promise is that documents do not
			// leave the device. The value here is not theoretical: an injected script
			// would have the whole library, the index and every answer in reach, on a
			// page that legitimately holds all of it.
			//
			// 'auto', not 'hash': hashes for the prerendered pages, whose HTML is a static
			// file, and a per-response nonce for everything the worker renders. Hash mode
			// alone left the app shell with no policy at all, because SvelteKit emits none
			// for a route with ssr off — so the protection covered the marketing pages,
			// which hold nothing, and not the workspace, which holds every document.
			// 'auto': hashes for the prerendered pages, a nonce for what the worker
			// renders. The directives live in src/lib/csp.ts because the worker has to
			// send the same ones as a header — SvelteKit emits no policy for a route with
			// ssr off, which is the whole app.
			csp: { mode: 'auto', directives: CSP_DIRECTIVES },

			adapter: adapter({
				platformProxy: {
					// Dev config = prod config minus the AI binding (see the note in
					// wrangler.dev.jsonc). Also disable remote bindings entirely: dev
					// must never depend on Cloudflare's remote-bindings service.
					configPath: 'wrangler.dev.jsonc',
					remoteBindings: false
				}
			})
		})
	],
	worker: {
		format: 'es'
	},
	server: {
		// Nested agent worktrees live under .claude/worktrees INSIDE this tree.
		// Their svelte-kit sync rewrites a tsconfig on every agent turn, which
		// this server's watcher read as a config change and answered with a
		// full-reload of every client — killing any long browser run (the 117
		// benchmark died twice at exactly those timestamps).
		watch: { ignored: ['**/.claude/**'] },
		// Cross-origin isolation (spec 018): worker scripts are served by vite,
		// not hooks.server.ts, and COEP blocks a worker whose own response lacks
		// the headers. Prod equivalent lives in static/_headers.
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'credentialless'
		}
	},
	preview: {
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'credentialless'
		}
	},
	optimizeDeps: {
		// Pre-bundling breaks these packages' runtime asset resolution (wasm/onnx).
		exclude: ['sqlite-vec-wasm-demo', '@huggingface/transformers', 'pdfjs-dist']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
