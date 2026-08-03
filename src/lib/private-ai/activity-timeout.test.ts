import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityTimeoutError, withActivityTimeout } from './activity-timeout';

afterEach(() => {
	vi.useRealTimers();
});

describe('activity timeout', () => {
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
});
