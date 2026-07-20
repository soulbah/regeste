// A worker whose script fails to load still constructs. Comlink then waits on a
// reply that never comes — no rejection, no timeout — so the page sits on its
// skeletons forever with nothing to show for it. That shipped once already (the
// database worker served as raw .ts on the first Cloudflare deploy), and a
// content-hashed script the origin stopped serving after a redeploy reaches the
// same dead end. Observe the failure so the user is told instead of waiting.

/** Which part of the app went with it. The database is every session's first
 * dependency, so losing it is a different event from losing OCR. */
export type WorkerFeature = 'db' | 'search' | 'ocr' | 'privateAi';

const BLOCKING: WorkerFeature = 'db';

class WorkerHealth {
	/** The failed feature, or null while all are fine. */
	failed = $state<WorkerFeature | null>(null);

	/** First failure wins, EXCEPT that the database replaces whatever partial
	 * failure is already on screen: a query fired during boot can latch 'search'
	 * a moment before the database dies, and "search stopped working" is a poor
	 * description of an app that can no longer open anything. */
	report(feature: WorkerFeature): void {
		if (this.failed === BLOCKING) return;
		if (this.failed !== null && feature !== BLOCKING) return;
		this.failed = feature;
	}
}

export const workerHealth = new WorkerHealth();

/** Attach to an ALREADY-CONSTRUCTED worker. Vite's worker bundling is syntactic:
 * `new Worker(new URL('./x.ts', import.meta.url), …)` is only compiled when that
 * call is a bare literal, so this takes the instance and never wraps the call.
 *
 * Covers the script that never loads, which is the failure a redeploy causes. It
 * does NOT cover a worker that loads and then never answers: catching that needs
 * a deadline, and every deadline we sized was longer than a slow first boot is
 * allowed to take (the database alone fetches 6.3 MB of SQLite WASM), so it
 * would raise a false alarm on the exact cold start it was meant to protect. */
export function guardWorker(worker: Worker, feature: WorkerFeature): Worker {
	worker.addEventListener('error', (event) => {
		// A script that 404s fires a bare event: no message, no filename (verified
		// in Chromium). The one certainty is that no call against it will answer.
		event.preventDefault();
		console.warn(`[folio] worker failed to load: ${feature}`);
		workerHealth.report(feature);
	});
	return worker;
}
