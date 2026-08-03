import { describe, expect, it } from 'vitest';
import { SERVICE_WORKER_RESTARTED, ServiceWorkerLifecycle } from './service-worker-lifecycle';

describe('inference Service Worker lifecycle', () => {
	it('rejects every orphaned request when the controller changes', async () => {
		const lifecycle = new ServiceWorkerLifecycle();
		const first = new Promise((resolve, reject) => lifecycle.add('load', { resolve, reject }));
		const second = new Promise((resolve, reject) => lifecycle.add('generate', { resolve, reject }));

		lifecycle.controllerChanged();

		await expect(first).rejects.toThrow(SERVICE_WORKER_RESTARTED);
		await expect(second).rejects.toThrow(SERVICE_WORKER_RESTARTED);
		expect(lifecycle.size).toBe(0);
	});

	it('detects silent worker replacement from a changed boot id', async () => {
		const lifecycle = new ServiceWorkerLifecycle();
		expect(lifecycle.observeInstance('worker-a')).toBe(false);
		const pending = new Promise((resolve, reject) => lifecycle.add('load', { resolve, reject }));

		expect(lifecycle.observeInstance('worker-b')).toBe(true);
		await expect(pending).rejects.toThrow(SERVICE_WORKER_RESTARTED);
		expect(lifecycle.observeInstance('worker-b')).toBe(false);
	});

	it('settles a normal response exactly once', async () => {
		const lifecycle = new ServiceWorkerLifecycle();
		const pending = new Promise((resolve, reject) => lifecycle.add('ping', { resolve, reject }));
		lifecycle.resolve('ping', 'worker-a');
		lifecycle.reject('ping', new Error('late reply'));

		await expect(pending).resolves.toBe('worker-a');
		expect(lifecycle.size).toBe(0);
	});
});
