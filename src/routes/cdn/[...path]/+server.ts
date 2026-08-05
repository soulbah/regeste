// Same-origin proxy for model weights (embeddings, wllama GGUF, WebLLM shards).
//
// Why this exists: Private mode requires cross-origin isolation
// (COOP=same-origin, COEP=credentialless) for SharedArrayBuffer. Under that
// isolation, the browser's cross-origin fetch to huggingface.co fails
// (`TypeError: Failed to fetch`) because HF answers /resolve/ with a redirect
// whose chain does not satisfy COEP. Fetching server-side (COEP does not apply
// to a Worker's own fetch) and streaming back as a same-origin response
// sidesteps the whole class of CORS/COEP download failures.
//
// Privacy: only public model files transit here — never user content. The
// host allowlist keeps this from being an open proxy.

import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';

// Hosts that legitimately serve the model weights we load. Suffix matches cover
// HuggingFace's LFS/xet CDNs that /resolve/ redirects to.
const ALLOWED_EXACT = new Set(['huggingface.co', 'raw.githubusercontent.com']);
const ALLOWED_SUFFIX = ['.huggingface.co', '.hf.co', '.githubusercontent.com'];

function hostAllowed(host: string): boolean {
	return ALLOWED_EXACT.has(host) || ALLOWED_SUFFIX.some((suffix) => host.endsWith(suffix));
}

// The catch-all param is attacker-controlled input. Splitting it on the first
// slash and re-concatenating into a URL let `example.com#.hf.co` pass the
// allowlist while fetch contacted example.com: the checked host and the
// fetched host diverged on `#`, `?` and `@`. Validate the shape first, then
// parse with the URL parser and check the host the fetch will actually see.
const PathSchema = v.pipe(
	v.string(),
	// One host segment then a path; no userinfo, query, fragment or backslash
	// anywhere — model files need none of them.
	v.regex(/^[a-z0-9.-]+\/[^?#@\\]*$/i, 'malformed proxy path')
);

export const GET: RequestHandler = async ({ params, url, request, fetch }) => {
	// e.g. "huggingface.co/Xenova/model/resolve/main/config.json"
	const parsed = v.safeParse(PathSchema, params.path);
	if (!parsed.success) throw error(400, 'malformed proxy path');

	let target: URL;
	try {
		target = new URL(`https://${parsed.output}${url.search}`);
	} catch {
		throw error(400, 'malformed proxy path');
	}
	// Check the host the URL parser resolved — the one fetch will contact —
	// not a substring of the raw param.
	if (!hostAllowed(target.hostname)) throw error(403, 'host not allowed');

	// Forward only Range (large shards) and conditional headers; never cookies.
	const forwardHeaders = new Headers();
	for (const name of ['range', 'if-none-match', 'if-modified-since', 'accept']) {
		const value = request.headers.get(name);
		if (value) forwardHeaders.set(name, value);
	}

	let upstream: Response;
	try {
		upstream = await fetch(target, { headers: forwardHeaders, redirect: 'follow' });
	} catch {
		throw error(502, 'upstream fetch failed');
	}

	const headers = new Headers();
	for (const name of [
		'content-type',
		'content-length',
		'content-range',
		'accept-ranges',
		'etag',
		'last-modified'
	]) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	// Model files at a pinned path are immutable; let the browser keep them.
	headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	// Same-origin already satisfies COEP, but be explicit for embedders.
	headers.set('Cross-Origin-Resource-Policy', 'same-origin');

	return new Response(upstream.body, { status: upstream.status, headers });
};
