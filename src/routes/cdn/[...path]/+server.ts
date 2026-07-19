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
import type { RequestHandler } from './$types';

// Hosts that legitimately serve the model weights we load. Suffix matches cover
// HuggingFace's LFS/xet CDNs that /resolve/ redirects to.
const ALLOWED_EXACT = new Set(['huggingface.co', 'raw.githubusercontent.com']);
const ALLOWED_SUFFIX = ['.huggingface.co', '.hf.co', '.githubusercontent.com'];

function hostAllowed(host: string): boolean {
	return ALLOWED_EXACT.has(host) || ALLOWED_SUFFIX.some((suffix) => host.endsWith(suffix));
}

export const GET: RequestHandler = async ({ params, url, request, fetch }) => {
	const path = params.path; // e.g. "huggingface.co/Xenova/model/resolve/main/config.json"
	const slash = path.indexOf('/');
	const host = slash === -1 ? path : path.slice(0, slash);
	if (!hostAllowed(host)) throw error(403, 'host not allowed');

	const target = `https://${path}${url.search}`;
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
