/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';
import { CreateMLCEngine, type MLCEngineInterface } from '@mlc-ai/web-llm';
import { proxiedAppConfig } from '$lib/private-ai/webllm-config';
import { isShellCache, shellCacheName } from '$lib/pwa/cache-names';
import { APP_SCOPE, isAppNavigation, isMarketingAsset } from '$lib/pwa/sw-routing';
import type { GenerationOptions, GenerationResult } from '$lib/private-ai/generation';
import { ModelLoadCoordinator } from '$lib/private-ai/model-load-coordinator';

const sw = self as unknown as ServiceWorkerGlobalScope;
let engine: MLCEngineInterface | null = null;
let loadedModel: string | null = null;
let loadGeneration = 0;
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
	// hooks.server.ts, and the Cache API preserves stored headers. A synthesised
	// Response would strip them, cross-origin isolation would drop on the cached
	// path only, and SharedArrayBuffer (so the wllama CPU tier) would die
	// offline while every dev test still passed. Fail install loudly instead.
	const shell = await fetch(SHELL_KEY, { cache: 'reload' });
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
	await Promise.allSettled(
		assets.map(async (url) => {
			const response = await fetch(url, { cache: 'reload' });
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
			if (!engine) {
				const created = await CreateMLCEngine(model, {
					appConfig: proxiedAppConfig(sw.location.origin),
					initProgressCallback: onProgress
				});
				if (generation !== loadGeneration) {
					await created.unload();
					throw new Error('model load cancelled');
				}
				engine = created;
			} else {
				engine.setInitProgressCallback(onProgress);
				await engine.reload(model);
				if (generation !== loadGeneration) throw new Error('model load cancelled');
			}
			loadedModel = model;
		}
	);
}

async function unload(): Promise<void> {
	loadGeneration++;
	await modelLoads.runExclusive(async () => {
		const current = engine;
		engine = null;
		loadedModel = null;
		await current?.unload();
	});
}

async function generate(
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
	options: GenerationOptions,
	onDelta: (delta: string) => void
): Promise<GenerationResult> {
	if (!engine) throw new Error('private engine not loaded');
	const started = performance.now();
	let firstTokenAt: number | null = null;
	let completionTokens: number | null = null;
	let text = '';
	const chunks = await engine.chat.completions.create({
		messages,
		stream: true,
		temperature: 0.2,
		max_tokens: options.maxTokens,
		extra_body: { enable_thinking: options.reasoning === 'on' },
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
	}
	const finished = performance.now();
	return {
		text,
		ttftMs: firstTokenAt === null ? null : firstTokenAt - started,
		tokensPerSecond:
			completionTokens && firstTokenAt !== null && finished > firstTokenAt
				? completionTokens / ((finished - firstTokenAt) / 1000)
				: null,
		completionTokens
	};
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
		if ((event.data as { kind?: string }).kind === 'skip-waiting') void sw.skipWaiting();
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
					const result = await generate(message.messages, message.options, (delta) =>
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
					error: error instanceof Error ? error.message : String(error)
				});
			}
		})()
	);
});
