import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ActivityTimeoutError,
	measuredProgressActivity,
	withActivityTimeout
} from './activity-timeout';

afterEach(() => {
	vi.useRealTimers();
});

describe('activity timeout', () => {
	it('ignores setup zeroes until measured progress begins', () => {
		const activity = vi.fn();
		const report = measuredProgressActivity(activity);

		report(0);
		report(Number.NaN);
		expect(activity).not.toHaveBeenCalled();

		report(0.001);
		report(0);
		expect(activity).toHaveBeenCalledTimes(2);
	});

	it('resolves work that completes inside the inactivity window', async () => {
		vi.useFakeTimers();
		const cleanup = vi.fn();
		const result = withActivityTimeout(async () => 'ready', 100, cleanup);

		await expect(result).resolves.toBe('ready');
		expect(cleanup).not.toHaveBeenCalled();
	});

	it('moves the deadline whenever progress is reported', async () => {
		vi.useFakeTimers();
		let reportActivity: () => void = () => undefined;
		let complete: (value: string) => void = () => undefined;
		const cleanup = vi.fn();
		const result = withActivityTimeout(
			(activity) =>
				new Promise<string>((resolve) => {
					reportActivity = activity;
					complete = resolve;
				}),
			100,
			cleanup
		);

		await vi.advanceTimersByTimeAsync(90);
		reportActivity();
		await vi.advanceTimersByTimeAsync(90);
		complete('ready');
		await expect(result).resolves.toBe('ready');
		expect(cleanup).not.toHaveBeenCalled();
	});

	it('cancels and rejects work that stops making progress', async () => {
		vi.useFakeTimers();
		const cleanup = vi.fn();
		const result = withActivityTimeout(() => new Promise<never>(() => undefined), 100, cleanup);
		const rejection = expect(result).rejects.toBeInstanceOf(ActivityTimeoutError);

		await vi.advanceTimersByTimeAsync(100);
		await rejection;
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it('uses a shorter first-progress deadline, then the normal inactivity window', async () => {
		vi.useFakeTimers();
		let reportActivity: () => void = () => undefined;
		let complete: (value: string) => void = () => undefined;
		const cleanup = vi.fn();
		const result = withActivityTimeout(
			(activity) =>
				new Promise<string>((resolve) => {
					reportActivity = activity;
					complete = resolve;
				}),
			100,
			cleanup,
			30
		);

		await vi.advanceTimersByTimeAsync(25);
		reportActivity();
		await vi.advanceTimersByTimeAsync(90);
		complete('ready');
		await expect(result).resolves.toBe('ready');
		expect(cleanup).not.toHaveBeenCalled();
	});

	it('cancels before the long idle window when no first progress arrives', async () => {
		vi.useFakeTimers();
		const cleanup = vi.fn();
		const result = withActivityTimeout(() => new Promise<never>(() => undefined), 100, cleanup, 30);
		const rejection = expect(result).rejects.toThrow('30 ms');

		await vi.advanceTimersByTimeAsync(30);
		await rejection;
		expect(cleanup).toHaveBeenCalledOnce();
	});
});
