export type ModelLoadProgressListener<T> = (progress: T) => void;

interface ModelLoadFlight<T> {
	model: string;
	listeners: Set<ModelLoadProgressListener<T>>;
	hasProgress: boolean;
	lastProgress: T | null;
	promise: Promise<void>;
}

/**
 * Coalesce same-model loads and serialize different-model loads.
 *
 * A refreshed page is a new Service Worker client. It must subscribe to the
 * load already owned by the worker instead of starting a second GPU/cache job.
 */
export class ModelLoadCoordinator<T> {
	private flight: ModelLoadFlight<T> | null = null;
	private exclusiveGate: Promise<void> | null = null;

	async run(
		model: string,
		onProgress: ModelLoadProgressListener<T>,
		start: (publish: ModelLoadProgressListener<T>) => Promise<void>
	): Promise<void> {
		for (;;) {
			if (this.exclusiveGate) {
				await this.exclusiveGate.catch(() => undefined);
				continue;
			}
			if (!this.flight) break;
			const active = this.flight;
			if (active.model === model) {
				active.listeners.add(onProgress);
				if (active.hasProgress) onProgress(active.lastProgress as T);
				return active.promise;
			}
			await active.promise.catch(() => undefined);
		}

		const flight: ModelLoadFlight<T> = {
			model,
			listeners: new Set([onProgress]),
			hasProgress: false,
			lastProgress: null,
			promise: Promise.resolve()
		};
		this.flight = flight;
		flight.promise = Promise.resolve()
			.then(() =>
				start((progress) => {
					flight.hasProgress = true;
					flight.lastProgress = progress;
					for (const listener of flight.listeners) listener(progress);
				})
			)
			.finally(() => {
				if (this.flight === flight) this.flight = null;
			});
		return flight.promise;
	}

	async waitForIdle(): Promise<void> {
		while (this.flight) {
			const active = this.flight;
			await active.promise.catch(() => undefined);
		}
	}

	/** Block new loads, drain current flight, then mutate engine ownership. */
	async runExclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
		for (;;) {
			if (this.exclusiveGate) {
				await this.exclusiveGate.catch(() => undefined);
				continue;
			}
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			this.exclusiveGate = gate;
			try {
				await this.waitForIdle();
				return await operation();
			} finally {
				if (this.exclusiveGate === gate) this.exclusiveGate = null;
				release();
			}
		}
	}

	/** Block new loads, cancel the active one, then wait until its promise has
	 * observed that cancellation. Unlike runExclusive(), cancellation must run
	 * before draining: a multi-gigabyte fetch cannot finish merely so it may be
	 * erased afterwards. */
	async cancelAndRunExclusive(cancel: () => Promise<void>): Promise<void> {
		for (;;) {
			if (this.exclusiveGate) {
				await this.exclusiveGate.catch(() => undefined);
				continue;
			}
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			this.exclusiveGate = gate;
			try {
				// Keep the gate until the flight settles even when engine cancellation
				// itself rejects. Releasing it from that error path lets a fresh load
				// overlap the still-unwinding engine the wipe was meant to stop.
				try {
					await cancel();
				} finally {
					await this.waitForIdle();
				}
			} finally {
				if (this.exclusiveGate === gate) this.exclusiveGate = null;
				release();
			}
			return;
		}
	}
}
