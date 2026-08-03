export class ActivityTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Operation made no progress for ${timeoutMs} ms`);
		this.name = 'ActivityTimeoutError';
	}
}

/** Reject work that stops reporting activity, while allowing slow work that
 * continues to advance. The timeout callback owns cancellation because only
 * the caller knows which worker or request must be discarded. */
export function withActivityTimeout<T>(
	run: (activity: () => void) => Promise<T>,
	timeoutMs: number,
	onTimeout: () => void
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
		const timeout = () =>
			finish(() => {
				onTimeout();
				reject(new ActivityTimeoutError(timeoutMs));
			});
		const activity = () => {
			if (settled) return;
			clearTimeout(timer);
			timer = setTimeout(timeout, timeoutMs);
		};

		activity();
		Promise.resolve()
			.then(() => run(activity))
			.then(
				(value) => finish(() => resolve(value)),
				(error) => finish(() => reject(error))
			);
	});
}
