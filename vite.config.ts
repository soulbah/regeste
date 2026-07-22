import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import fuzzyManifest from './benchmarks/fuzzy-corpus-manifest.json';
import type { Plugin } from 'vite';

const FUZZY_FIXTURE_PREFIX = '/dev/fuzzy-public/';
const PRIVATE_FIXTURE_PREFIX = '/dev/private-fixtures/';
const fuzzyFixtureDirectory = resolve(import.meta.dirname, fuzzyManifest.outputDirectory);
const privateFixtureDirectory = resolve(import.meta.dirname, '.benchmark-corpus/private');
const fuzzyFixtureNames = new Set(fuzzyManifest.files.map((file) => file.name));

/** Public research fixtures are dev inputs, not deployable application assets.
 * Serve them from the ignored benchmark cache only while Vite is running.
 * Private local fixtures (never committed, never deployed) are exposed the
 * same way so the dev benchmark page can ingest them without manual upload. */
function localBenchmarkFixtures(): Plugin {
	return {
		name: 'regeste-local-benchmark-fixtures',
		apply: 'serve' as const,
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				try {
					const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
					const isPrivate = pathname.startsWith(PRIVATE_FIXTURE_PREFIX);
					if (!pathname.startsWith(FUZZY_FIXTURE_PREFIX) && !isPrivate) return next();
					const name = decodeURIComponent(
						pathname.slice((isPrivate ? PRIVATE_FIXTURE_PREFIX : FUZZY_FIXTURE_PREFIX).length)
					);
					if (name.includes('/') || name.includes('..')) return next();
					if (!isPrivate && !fuzzyFixtureNames.has(name)) return next();
					const path = resolve(isPrivate ? privateFixtureDirectory : fuzzyFixtureDirectory, name);
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
