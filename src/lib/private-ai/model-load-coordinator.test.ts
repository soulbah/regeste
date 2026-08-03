import { describe, expect, it } from 'vitest';
import { ModelLoadCoordinator } from './model-load-coordinator';

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('ModelLoadCoordinator', () => {
	it('coalesces same-model loads and replays latest progress to a refreshed client', async () => {
		const coordinator = new ModelLoadCoordinator<number>();
		const gate = deferred();
		const firstProgress: number[] = [];
		const refreshedProgress: number[] = [];
		let starts = 0;
		let publish: ((progress: number) => void) | null = null;
		const start = async (report: (progress: number) => void) => {
			starts++;
			publish = report;
			await gate.promise;
		};

		const first = coordinator.run('model-a', (progress) => firstProgress.push(progress), start);
		await Promise.resolve();
		publish!(0.4);
		const refreshed = coordinator.run(
			'model-a',
			(progress) => refreshedProgress.push(progress),
			start
		);
		publish!(0.8);
		gate.resolve();
		await Promise.all([first, refreshed]);

		expect(starts).toBe(1);
		expect(firstProgress).toEqual([0.4, 0.8]);
		expect(refreshedProgress).toEqual([0.4, 0.8]);
	});

	it('serializes different model loads', async () => {
		const coordinator = new ModelLoadCoordinator<number>();
		const firstGate = deferred();
		const order: string[] = [];
		const first = coordinator.run(
			'model-a',
			() => {},
			async () => {
				order.push('a:start');
				await firstGate.promise;
				order.push('a:end');
			}
		);
		const second = coordinator.run(
			'model-b',
			() => {},
			async () => {
				order.push('b:start');
			}
		);
		await Promise.resolve();
		expect(order).toEqual(['a:start']);
		firstGate.resolve();
		await Promise.all([first, second]);
		expect(order).toEqual(['a:start', 'a:end', 'b:start']);
	});

	it('keeps a new load behind an exclusive unload operation', async () => {
		const coordinator = new ModelLoadCoordinator<number>();
		const loadGate = deferred();
		const unloadStarted = deferred();
		const unloadGate = deferred();
		const order: string[] = [];
		const first = coordinator.run(
			'model-a',
			() => {},
			async () => {
				order.push('a:start');
				await loadGate.promise;
				order.push('a:end');
			}
		);
		await Promise.resolve();
		const unload = coordinator.runExclusive(async () => {
			order.push('unload:start');
			unloadStarted.resolve();
			await unloadGate.promise;
			order.push('unload:end');
		});
		const second = coordinator.run(
			'model-b',
			() => {},
			async () => {
				order.push('b:start');
			}
		);
		loadGate.resolve();
		await first;
		await unloadStarted.promise;
		expect(order).toEqual(['a:start', 'a:end', 'unload:start']);
		unloadGate.resolve();
		await Promise.all([unload, second]);
		expect(order).toEqual(['a:start', 'a:end', 'unload:start', 'unload:end', 'b:start']);
	});

	it('cancels an active load before waiting and keeps the next load behind cleanup', async () => {
		const coordinator = new ModelLoadCoordinator<number>();
		const cancelled = deferred();
		const order: string[] = [];
		const first = coordinator.run(
			'model-a',
			() => {},
			async () => {
				order.push('a:start');
				await cancelled.promise;
				order.push('a:cancelled');
				throw new Error('cancelled');
			}
		);
		await Promise.resolve();
		const cancel = coordinator.cancelAndRunExclusive(async () => {
			order.push('cancel:start');
			cancelled.resolve();
		});
		const second = coordinator.run(
			'model-b',
			() => {},
			async () => {
				order.push('b:start');
			}
		);

		await expect(first).rejects.toThrow('cancelled');
		await Promise.all([cancel, second]);
		expect(order).toEqual(['a:start', 'cancel:start', 'a:cancelled', 'b:start']);
	});

	it('keeps the exclusive gate until the flight drains when cancellation rejects', async () => {
		const coordinator = new ModelLoadCoordinator<number>();
		const flightGate = deferred();
		const order: string[] = [];
		const first = coordinator.run(
			'model-a',
			() => {},
			async () => {
				order.push('a:start');
				await flightGate.promise;
				order.push('a:end');
			}
		);
		await Promise.resolve();
		const cancel = coordinator.cancelAndRunExclusive(async () => {
			order.push('cancel');
			throw new Error('unload failed');
		});
		const second = coordinator.run(
			'model-b',
			() => {},
			async () => {
				order.push('b:start');
			}
		);

		await Promise.resolve();
		expect(order).toEqual(['a:start', 'cancel']);
		flightGate.resolve();
		await first;
		await expect(cancel).rejects.toThrow('unload failed');
		await second;
		expect(order).toEqual(['a:start', 'cancel', 'a:end', 'b:start']);
	});
});
