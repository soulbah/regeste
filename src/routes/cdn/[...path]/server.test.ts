import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

function eventFor(path: string, search = '') {
	const url = new URL(`https://regeste.com/cdn/${path}${search}`);
	const fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
	const event = {
		params: { path },
		url,
		request: new Request(url),
		fetch
	} as unknown as Parameters<typeof GET>[0];
	return { event, fetch };
}

describe('cdn proxy host allowlist', () => {
	it('proxies an allowlisted model host', async () => {
		const { event, fetch } = eventFor('huggingface.co/Xenova/model/resolve/main/config.json');
		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(fetch).toHaveBeenCalledOnce();
		expect(String(fetch.mock.calls[0][0])).toBe(
			'https://huggingface.co/Xenova/model/resolve/main/config.json'
		);
	});

	it('refuses a host outside the allowlist', async () => {
		const { event, fetch } = eventFor('example.com/x');
		await expect(GET(event)).rejects.toMatchObject({ status: 403 });
		expect(fetch).not.toHaveBeenCalled();
	});

	// The regression this file exists for: a fragment, query or userinfo
	// marker inside the path made the checked host and the fetched host
	// diverge — `example.com#.hf.co` passed endsWith('.hf.co') while fetch
	// contacted example.com. An open proxy on our own origin, with a year of
	// immutable cache on top.
	it.each([
		'example.com#.hf.co/x',
		'example.com?.hf.co/x',
		'example.com@huggingface.co/x',
		'example.com\\.hf.co/x'
	])('refuses the host-confusion shape %s', async (path) => {
		const { event, fetch } = eventFor(path);
		await expect(GET(event)).rejects.toMatchObject({ status: 400 });
		expect(fetch).not.toHaveBeenCalled();
	});
});
