import { describe, expect, it } from 'vitest';
import { POST } from './+server';

function eventFor(body: unknown, headers: Record<string, string> = {}): Parameters<typeof POST>[0] {
	const url = new URL('https://regeste.com/api/local-wipe');
	return {
		request: new Request(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify(body)
		}),
		url
	} as unknown as Parameters<typeof POST>[0];
}

describe('local wipe endpoint', () => {
	it('asks the browser to clear cache and storage but keeps account cookies', async () => {
		const response = await POST(
			eventFor(
				{ confirm: 'erase-local-data' },
				{ origin: 'https://regeste.com', 'sec-fetch-site': 'same-origin' }
			)
		);
		const directive = response.headers.get('clear-site-data');

		expect(response.status).toBe(200);
		expect(directive).toContain('"cache"');
		expect(directive).toContain('"storage"');
		expect(directive).not.toContain('"executionContexts"');
		expect(directive).not.toContain('cookies');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('rejects a cross-site wipe request', async () => {
		await expect(
			POST(
				eventFor(
					{ confirm: 'erase-local-data' },
					{ origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }
				)
			)
		).rejects.toMatchObject({ status: 403 });
	});

	it('rejects a request without explicit confirmation', async () => {
		await expect(POST(eventFor({}))).rejects.toMatchObject({ status: 400 });
	});
});
