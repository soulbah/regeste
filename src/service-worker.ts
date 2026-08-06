/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';
import { MLCEngine, type MLCEngineInterface } from '@mlc-ai/web-llm';
import { installStreamAsyncIterator } from '$lib/compat/stream-async-iterator';
import { proxiedAppConfig } from '$lib/private-ai/webllm-config';
import { isShellCache, shellCacheName } from '$lib/pwa/cache-names';
import { APP_SCOPE, isAppNavigation, isMarketingAsset } from '$lib/pwa/sw-routing';
import {
	webLlmGenerationParameters,
	type GenerationOptions,
	type GenerationResult
} from '$lib/private-ai/generation';
import { ModelLoadCoordinator } from '$lib/private-ai/model-load-coordinator';

// Streamed generation below uses `for await`, which WebKit cannot do on a
// ReadableStream (see the polyfill). A service worker has its own global.
installStreamAsyncIterator();

const sw = self as unknown as ServiceWorkerGlobalScope;
let engine: MLCEngineInterface | null = null;
let loadedModel: string | null = null;
let loadGeneration = 0;
// WebLLM is imported statically, and it has to be: `import()` throws
// "import() is disallowed on ServiceWorkerGlobalScope by the HTML
// specification" (w3c/ServiceWorker#1356) — verified in this worker's own
// scope, not assumed. Loading the engine on demand is therefore impossible
// here, so this script carries the whole runtime and every boot parses it.
// That cost is real; it is paid down by keeping the top level free of work
// (see the install handler) rather than by splitting the bundle.
interface ModelLoadProgress {
	progress: number;
	text: string;
}
const modelLoads = new ModelLoadCoordinator<ModelLoadProgress>();
// A controller can stay stable while the browser kills and reboots its backing
// Service Worker. The page heartbeats this per-boot id to detect that otherwise
// invisible replacement and reject requests orphaned in the previous instance.
const workerInstance = crypto.randomUUID();

// ---------------------------------------------------------------------------
// App shell (spec 030). This worker keeps its WebLLM role above; the cache
// below is a second, independent role in the same registration — a second
// registration at scope "/" would silently replace this one and kill Private
// mode with no build error.
// ---------------------------------------------------------------------------

const SHELL_CACHE = shellCacheName(version);
const SHELL_KEY = APP_SCOPE;

/** The SQLite engine is needed by 100% of sessions: without it the app opens
 * and then the database throws. Everything else large stays out of the eager
 * set (workers are 62 MB; model weights are gigabytes and are owned by the
 * libraries' own Cache API entries). */
const EAGER_EXTRA = ['/vendor/sqlite/sqlite3.mjs', '/vendor/sqlite/sqlite3.wasm'];

function isEagerBuildAsset(pathname: string): boolean {
	return (
		pathname.startsWith('/_app/immutable/entry/') ||
		pathname.startsWith('/_app/immutable/nodes/') ||
		pathname.startsWith('/_app/immutable/chunks/') ||
		(pathname.startsWith('/_app/immutable/assets/') &&
			(pathname.endsWith('.css') || pathname.endsWith('.woff2')))
	);
}

/** Big, device-specific assets: cached only once actually requested, so a user
 * stores the ONNX runtime variant their device loads and nothing else. */
function isRuntimeCacheable(pathname: string): boolean {
	return (
		pathname.startsWith('/_app/immutable/workers/') ||
		(pathname.startsWith('/_app/immutable/assets/') && pathname.endsWith('.mjs'))
	);
}

async function precache(): Promise<void> {
	const cache = await caches.open(SHELL_CACHE);

	// The navigation shell must be a FETCHED response: it carries COOP/COEP from
	// hooks.server.ts (or the _headers file, for the prerendered pages), and the
	// Cache API preserves stored headers. A synthesised Response would strip
	// them, cross-origin isolation would drop on the cached path only, and
	// SharedArrayBuffer (so the wllama CPU tier) would die offline while every
	// dev test still passed. Fail install loudly instead.
	//
	// Plain fetch, deliberately NOT cache:'reload'. The asset store serves /chat
	// with `Cache-Control: public, max-age=0, must-revalidate` and an ETag, so
	// the browser revalidates a stale copy and the install never blocks on a
	// full origin round trip. Forcing reload used to re-fetch every eager asset
	// from origin on every install; on a cold Cloudflare edge those requests
	// took ~20 s each (measured), installs took minutes or died, and the worker
	// never activated.
	const shell = await fetch(SHELL_KEY);
	if (!shell.ok) throw new Error(`shell fetch failed: ${shell.status}`);
	// A redirected response replayed for a navigation throws
	// "Response served by service worker has redirected". SHELL_KEY has no
	// trailing slash precisely because SvelteKit would 308 it away.
	if (shell.redirected) throw new Error(`shell redirected to ${shell.url}`);
	if (
		!shell.headers.get('Cross-Origin-Opener-Policy') ||
		!shell.headers.get('Cross-Origin-Embedder-Policy')
	) {
		throw new Error('shell response lacks cross-origin isolation headers');
	}
	await cache.put(SHELL_KEY, shell);

	// Tolerant: one failed asset must not reject install. A rejected install
	// leaves the user with NO service worker at all — including no WebLLM host.
	const assets = [
		...build.filter((url) => isEagerBuildAsset(new URL(url, sw.location.origin).pathname)),
		...EAGER_EXTRA
	];
	// The eager assets are content-addressed (`/immutable/`), so a cached copy
	// is the copy, forever: no revalidation is ever needed, and none is forced.
	await Promise.allSettled(
		assets.map(async (url) => {
			const response = await fetch(url);
			// Cache.put stores a 404 as readily as a 200, and a stored failure is
			// permanent for the life of this cache version — nothing ever refetches
			// an entry that is already there. Drop it instead and let the runtime
			// path retry against the network.
			if (!response.ok) throw new Error(`${url}: ${response.status}`);
			await cache.put(url, response);
		})
	);
}

async function dropOldCaches(): Promise<void> {
	const names = await caches.keys();
	await Promise.all(
		names
			.filter((name) => isShellCache(name) && name !== SHELL_CACHE)
			.map((name) => caches.delete(name))
	);
}

async function serveFromCache(request: Request, key: string): Promise<Response> {
	const cache = await caches.open(SHELL_CACHE);
	const hit = await cache.match(key);
	if (hit) return hit;
	const response = await fetch(request);
	if (response.ok && response.status === 200) void cache.put(key, response.clone());
	return response;
}

type RequestMessage =
	| { source: 'regeste-llm'; id: string; kind: 'load'; model: string }
	| {
			source: 'regeste-llm';
			id: string;
			kind: 'generate';
			model: string;
			messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
			options: GenerationOptions;
	  }
	| { source: 'regeste-llm'; id: string; kind: 'abort' | 'ping' | 'unload' };

function reply(client: Client | ServiceWorker | MessagePort | null, message: object): void {
	try {
		client?.postMessage({ source: 'regeste-llm', ...message });
	} catch {
		// A refresh detaches the old Client while its event.waitUntil may still
		// own model work. New clients subscribe to that work through modelLoads.
	}
}

async function load(
	client: Client | ServiceWorker | MessagePort | null,
	id: string,
	model: string
): Promise<void> {
	await modelLoads.run(
		model,
		(report) =>
			reply(client, {
				id,
				kind: 'progress',
				progress: report.progress,
				text: report.text
			}),
		async (onProgress) => {
			const generation = ++loadGeneration;
			if (engine && loadedModel === model) {
				onProgress({ progress: 1, text: 'Model already loaded' });
				return;
			}
			// reload() mutates engine state. From here until success, no previous
			// model may be advertised as usable.
			loadedModel = null;
			if (!engine) {
				// Keep the engine handle before reload starts. MLCEngine.unload() aborts
				// its reload controller, but CreateMLCEngine only returns the handle after
				// every shard has arrived. The old shape made a panic wipe wait for a
				// multi-gigabyte download it was trying to delete.
				const created = new MLCEngine({
					appConfig: proxiedAppConfig(sw.location.origin),
					initProgressCallback: onProgress
				});
				engine = created;
				try {
					await created.reload(model);
				} catch (error) {
					if (engine === created) {
						engine = null;
						loadedModel = null;
						await created.unload().catch(() => undefined);
					}
					throw error;
				}
				if (generation !== loadGeneration) {
					if (engine === created) engine = null;
					await created.unload();
					throw new Error('model load cancelled');
				}
			} else {
				const current = engine;
				current.setInitProgressCallback(onProgress);
				try {
					await current.reload(model);
				} catch (error) {
					if (engine === current) {
						engine = null;
						loadedModel = null;
					}
					await current.unload().catch(() => undefined);
					throw error;
				}
				if (generation !== loadGeneration) throw new Error('model load cancelled');
			}
			loadedModel = model;
		}
	);
}

async function unload(): Promise<void> {
	loadGeneration++;
	// Generation owns the same exclusive gate as reload. Interrupt it before
	// waiting for that gate, otherwise a wipe would wait for every remaining token.
	await engine?.interruptGenerate().catch(() => undefined);
	await modelLoads.cancelAndRunExclusive(async () => {
		const current = engine;
		engine = null;
		loadedModel = null;
		// This now aborts reload immediately because load() publishes the engine
		// handle before the first fetch. The coordinator then drains the rejected
		// flight before allowing another model to start.
		await current?.unload();
	});
}

async function generate(
	model: string,
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	options: GenerationOptions,
	onDelta: (delta: string) => void
): Promise<GenerationResult> {
	return modelLoads.runExclusive(async () => {
		if (!engine || !loadedModel) throw new Error('private engine not loaded');
		if (loadedModel !== model) throw new Error('private engine model changed');
		const current = engine;
		const started = performance.now();
		let firstTokenAt: number | null = null;
		let completionTokens: number | null = null;
		let grammarInitMs: number | null = null;
		let grammarPerTokenMs: number | null = null;
		let text = '';
		const chunks = await current.chat.completions.create({
			messages,
			stream: true,
			...webLlmGenerationParameters(options),
			stream_options: { include_usage: true }
		});
		for await (const chunk of chunks) {
			const delta = chunk.choices[0]?.delta?.content ?? '';
			if (delta) {
				firstTokenAt ??= performance.now();
				text += delta;
				onDelta(delta);
			}
			completionTokens = chunk.usage?.completion_tokens ?? completionTokens;
			grammarInitMs = chunk.usage?.extra.grammar_init_s
				? chunk.usage.extra.grammar_init_s * 1000
				: grammarInitMs;
			grammarPerTokenMs = chunk.usage?.extra.grammar_per_token_s
				? chunk.usage.extra.grammar_per_token_s * 1000
				: grammarPerTokenMs;
		}
		const finished = performance.now();
		return {
			text,
			ttftMs: firstTokenAt === null ? null : firstTokenAt - started,
			tokensPerSecond:
				completionTokens && firstTokenAt !== null && finished > firstTokenAt
					? completionTokens / ((finished - firstTokenAt) / 1000)
					: null,
			completionTokens,
			grammarInitMs,
			grammarPerTokenMs
		};
	});
}

// No skipWaiting: an update that activated mid-session would delete the shell
// cache under a live page still importing old hashed chunks (which Cloudflare
// stops serving after a redeploy) and tear a loaded model out of an in-flight
// generation. The page asks for it explicitly instead (see the message branch).
sw.addEventListener('install', (event) => event.waitUntil(precache()));
// Claim BEFORE dropping: deleting the previous cache while its pages are still
// controlled by the previous worker leaves them fetching chunk names this deploy
// no longer serves. Claiming fires controllerchange, which reloads them onto this
// build, and only then does the old cache become unreachable.
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim().then(dropOldCaches)));

sw.addEventListener('fetch', (event: FetchEvent) => {
	const { request } = event;
	const url = new URL(request.url);

	// Bail-out ladder — each of these returns WITHOUT respondWith, so the request
	// goes to the network untouched.
	if (request.method !== 'GET') return;
	if (url.origin !== sw.location.origin) return;
	// Serving a cached 200 to a Range request corrupts resumable downloads.
	if (request.headers.has('range')) return;
	// Model weights: gigabytes, and WebLLM/transformers.js already own their own
	// Cache API entries for these exact URLs. Intercepting double-stores them and
	// inflates the quota the eviction policy reads.
	if (url.pathname.startsWith('/cdn/')) return;
	// Auth and the Assisted endpoint: never cached, never stale.
	if (url.pathname.startsWith('/api/')) return;
	// Update detection must always reach the network.
	if (url.pathname === '/service-worker.js' || url.pathname.startsWith('/_app/version.json'))
		return;

	// The installed app is the chat and nothing else: manifest scope says /chat,
	// and so does this worker. Marketing routes (the landing, how-it-works, the
	// guides, sign-in) go to the network like any web page — answering them from
	// the app shell would replace the landing with the chat for every returning
	// visitor, which is exactly what a catch-all navigate handler used to do.
	if (request.mode === 'navigate') {
		if (isAppNavigation(url.pathname)) {
			event.respondWith(serveFromCache(request, SHELL_KEY));
		}
		return;
	}
	if (isMarketingAsset(url.pathname)) return;
	if (
		isEagerBuildAsset(url.pathname) ||
		isRuntimeCacheable(url.pathname) ||
		files.includes(url.pathname)
	) {
		event.respondWith(serveFromCache(request, url.pathname));
	}
});

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
	// Declared before the regeste-llm guard so the inference protocol is untouched.
	if ((event.data as { source?: string } | null)?.source === 'regeste-pwa') {
		// Message handlers do not stay alive for an unobserved promise. Without
		// waitUntil(), Chromium could terminate this waiting worker before activation,
		// leaving the visible "Reload" action on the old shell indefinitely.
		if ((event.data as { kind?: string }).kind === 'skip-waiting')
			event.waitUntil(sw.skipWaiting());
		return;
	}
	const message = event.data as RequestMessage;
	if (!message || message.source !== 'regeste-llm') return;
	const client = event.source;
	event.waitUntil(
		(async () => {
			try {
				if (message.kind === 'ping') {
					reply(client, { id: message.id, kind: 'result', result: workerInstance });
					return;
				}
				if (message.kind === 'load') await load(client, message.id, message.model);
				else if (message.kind === 'generate') {
					const result = await generate(message.model, message.messages, message.options, (delta) =>
						reply(client, { id: message.id, kind: 'delta', delta })
					);
					reply(client, { id: message.id, kind: 'result', result });
					return;
				} else if (message.kind === 'abort') await engine?.interruptGenerate();
				else if (message.kind === 'unload') await unload();
				reply(client, { id: message.id, kind: 'result', result: null });
			} catch (error) {
				reply(client, {
					id: message.id,
					kind: 'error',
					error: error instanceof Error ? error.message : String(error),
					errorName: error instanceof Error ? error.name : 'Error'
				});
			}
		})()
	);
});
