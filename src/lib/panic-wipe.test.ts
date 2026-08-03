import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_WORKER_RESTARTED } from './private-ai/service-worker-lifecycle';
import { panicWipeContext, performPanicWipe, type PanicWipeActions } from './panic-wipe';

afterEach(() => {
	vi.useRealTimers();
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('panic wipe', () => {
	it('stops active inference before deleting any browser store', async () => {
		const stopped = deferred();
		const order: string[] = [];
		const actions: PanicWipeActions = {
			requestNativeWipe: async () => {
				order.push('native');
				throw new Error('offline');
			},
			stopInference: async () => {
				order.push('stop:start');
				await stopped.promise;
				order.push('stop:end');
			},
			unregisterWorkers: async () => {
				order.push('workers');
			},
			deleteCaches: async () => {
				order.push('caches');
			},
			deleteOpfs: async () => {
				order.push('opfs');
			},
			clearWebStorage: () => order.push('web-storage')
		};
		const phases: string[] = [];
		const wipe = performPanicWipe((phase) => phases.push(phase), actions);

		await vi.waitFor(() => expect(order).toEqual(['stop:start']));
		stopped.resolve();
		await wipe;

		expect(order.slice(0, 3)).toEqual(['stop:start', 'stop:end', 'native']);
		expect(order.indexOf('workers')).toBeGreaterThan(order.indexOf('stop:end'));
		expect(order.indexOf('caches')).toBeGreaterThan(order.indexOf('stop:end'));
		expect(order.indexOf('opfs')).toBeGreaterThan(order.indexOf('stop:end'));
		expect(order.at(-1)).toBe('web-storage');
		expect(phases).toEqual(['stopping', 'clearing', 'finishing']);
	});

	it('continues clearing after a timed-out inference shutdown', async () => {
		vi.useFakeTimers();
		let storageCleared = false;
		const actions: PanicWipeActions = {
			requestNativeWipe: async () => {
				throw new Error('offline');
			},
			stopInference: () => new Promise<never>(() => undefined),
			unregisterWorkers: async () => {
				throw new Error(SERVICE_WORKER_RESTARTED);
			},
			deleteCaches: async () => undefined,
			deleteOpfs: async () => undefined,
			clearWebStorage: () => {
				storageCleared = true;
			}
		};
		const wipe = performPanicWipe(() => undefined, actions, {
			server: 10,
			stop: 20,
			delete: 30
		});

		await vi.advanceTimersByTimeAsync(20);
		await wipe;
		expect(storageCleared).toBe(true);
	});

	it('only enters wipe boot for the explicit query and carries its language', () => {
		expect(
			panicWipeContext(new URL('https://regeste.com/chat?wipe-local-data=1&wipe-locale=fr'))
		).toEqual({ active: true, locale: 'fr' });
		expect(panicWipeContext(new URL('https://regeste.com/chat'))).toEqual({
			active: false,
			locale: 'en'
		});
	});
});
