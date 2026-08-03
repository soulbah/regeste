export interface ServiceRequest<T = unknown> {
	resolve: (value: T) => void;
	reject: (error: Error) => void;
	onProgress?: (progress: number, text: string) => void;
	onDelta?: (delta: string) => void;
}

export const SERVICE_WORKER_RESTARTED = 'inference service worker restarted';

interface PendingServiceRequest extends ServiceRequest {
	timeout: ReturnType<typeof setTimeout> | null;
}

/** Pending inference calls and the Service Worker instance serving them.
 * Browsers may terminate a Service Worker without changing its controller. A
 * boot id observed by heartbeat catches that silent replacement; an explicit
 * controller change takes the same path. In both cases orphaned promises must
 * reject so model loading can retry instead of leaving the UI busy forever. */
export class ServiceWorkerLifecycle {
	private readonly pending = new Map<string, PendingServiceRequest>();
	private instance: string | null = null;

	add<T>(id: string, request: ServiceRequest<T>, timeoutMs?: number): void {
		const pending = request as PendingServiceRequest;
		pending.timeout =
			timeoutMs === undefined
				? null
				: setTimeout(
						() => this.reject(id, new Error('inference service worker timed out')),
						timeoutMs
					);
		this.pending.set(id, pending);
	}

	get(id: string): ServiceRequest | undefined {
		return this.pending.get(id);
	}

	resolve(id: string, value: unknown): void {
		const request = this.take(id);
		request?.resolve(value);
	}

	reject(id: string, error: Error): void {
		const request = this.take(id);
		request?.reject(error);
	}

	controllerChanged(): void {
		this.instance = null;
		this.rejectAll(new Error(SERVICE_WORKER_RESTARTED));
	}

	/** Returns true when this boot id replaced a previously observed instance. */
	observeInstance(instance: string): boolean {
		const replaced = this.instance !== null && this.instance !== instance;
		this.instance = instance;
		if (replaced) this.rejectAll(new Error(SERVICE_WORKER_RESTARTED));
		return replaced;
	}

	get size(): number {
		return this.pending.size;
	}

	private take(id: string): PendingServiceRequest | undefined {
		const request = this.pending.get(id);
		if (!request) return undefined;
		this.pending.delete(id);
		if (request.timeout !== null) clearTimeout(request.timeout);
		return request;
	}

	private rejectAll(error: Error): void {
		for (const id of [...this.pending.keys()]) this.reject(id, error);
	}
}
