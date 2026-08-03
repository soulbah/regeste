export class ActivityTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Operation made no progress for ${timeoutMs} ms`);
		this.name = 'ActivityTimeoutError';
	}
}

/**
 * Turn measured 0..1 progress into watchdog activity.
 *
 * WebLLM emits a zero-valued setup callback before any model shard has arrived.
 * Treating that callback as progress replaced the short startup deadline with
 * the much longer idle deadline while the UI still showed no measurable work.
 * Once a positive value has arrived, later zeroes are activity too: WebLLM
 * resets progress when it moves from cache download to memory loading.
 */
export function measuredProgressActivity(activity: () => void): (progress: number) => void {
	let started = false;
	return (progress) => {
		if (Number.isFinite(progress) && progress > 0) started = true;
		if (started) activity();
	};
}

/** Reject work that stops reporting activity, while allowing slow work that
 * continues to advance. The timeout callback owns cancellation because only
 * the caller knows which worker or request must be discarded. */
export function withActivityTimeout<T>(
	run: (activity: () => void) => Promise<T>,
	timeoutMs: number,
	onTimeout: () => void,
	initialTimeoutMs = timeoutMs
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout>;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			callback();
		};
		const timeout = (elapsedMs: number) =>
			finish(() => {
				onTimeout();
				reject(new ActivityTimeoutError(elapsedMs));
			});
		const activity = () => {
			if (settled) return;
			clearTimeout(timer);
			timer = setTimeout(() => timeout(timeoutMs), timeoutMs);
		};

		// Starting a request is not progress. A separate, shorter first deadline
		// keeps a download from sitting at an unmoving 0% while the long inactivity
		// window still protects a genuinely slow multi-gigabyte transfer.
		timer = setTimeout(() => timeout(initialTimeoutMs), initialTimeoutMs);
		Promise.resolve()
			.then(() => run(activity))
			.then(
				(value) => finish(() => resolve(value)),
				(error) => finish(() => reject(error))
			);
	});
}
