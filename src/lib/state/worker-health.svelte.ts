// A worker whose script fails to load still constructs. Comlink then waits on a
// reply that never comes — no rejection, no timeout — so the page sits on its
// skeletons forever with nothing to show for it. That shipped once already (the
// database worker served as raw .ts on the first Cloudflare deploy), and a
// content-hashed script the origin stopped serving after a redeploy reaches the
// same dead end. Observe the failure so the user is told instead of waiting.

class WorkerHealth {
	/** Label of the first worker that failed to load; null while all are fine. */
	failed = $state<string | null>(null);
}

export const workerHealth = new WorkerHealth();

/** Attach to an ALREADY-CONSTRUCTED worker. Vite's worker bundling is syntactic:
 * `new Worker(new URL('./x.ts', import.meta.url), …)` is only compiled when that
 * call is a bare literal, so this takes the instance and never wraps the call. */
export function guardWorker(worker: Worker, label: string): Worker {
	worker.addEventListener('error', (event) => {
		// A script that 404s fires a bare event: no message, no filename (verified
		// in Chromium). The one certainty is that no call against it will answer.
		event.preventDefault();
		console.warn(`[folio] worker failed to load: ${label}`);
		workerHealth.failed ??= label;
	});
	return worker;
}
