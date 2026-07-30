// Private-mode engine state machine. Zero jargon reaches the UI: this module
// translates tiers/models into download sizes and plain states.
//
//   detecting → unavailable                    (no WebGPU)
//             → needs-download                 (first use, explicit consent)
//             → downloading(progress) → ready  (weights cached by WebLLM)
//   ready     → generating → ready
//   load failure → downgrade one tier → retry once → error (plain language)

import { wrap, proxy, type Remote } from 'comlink';
import { detectTier } from './capability';
import { downgrade, TIERS, type Tier } from './tiers';
import type { LlmApi } from './llm-worker';
import type { WllamaApi } from './wllama-worker';
import { guardWorker } from '$lib/state/worker-health.svelte';
import { adaptGenerationOptions, type GenerationOptions } from './generation';
import type { GenerationResult } from './generation';
import type { WebLlmClient } from './webllm-client';
import { t } from '$lib/i18n/index.svelte';

const PREPARED_KEY = 'regeste:private-prepared-model';
/**
 * Benchmark harness only: run a named tier instead of the one this machine is
 * offered. Comparing two models is only a comparison if the model is pinned,
 * otherwise the tier ladder decides what is being measured.
 *
 * It lives in localStorage rather than in a method because the dev harness and
 * the app reach this module through different specifiers, which Vite resolves
 * to two separate instances — pinning one left the other on its own tier.
 */
const FORCED_TIER_KEY = 'regeste:dev-force-tier';

function forcedTier(): Tier | null {
	try {
		const id = localStorage.getItem(FORCED_TIER_KEY);
		return id ? (TIERS.find((tier) => tier.id === id) ?? null) : null;
	} catch {
		return null;
	}
}
const METRICS_KEY = 'regeste:private-last-metrics';

export type PrivateStatus =
	| 'detecting'
	| 'unavailable'
	| 'needs-download'
	| 'downloading'
	| 'loading'
	| 'ready'
	| 'generating'
	| 'error';

// Both engines expose the same load/generate/abort surface.
let webllmApi: WebLlmClient | null = null;
let wllamaApi: Remote<WllamaApi> | null = null;
async function getWorker(engine: 'webllm' | 'wllama'): Promise<Remote<LlmApi> | WebLlmClient> {
	if (engine === 'wllama') {
		if (!wllamaApi) {
			const worker = new Worker(new URL('./wllama-worker.ts', import.meta.url), {
				type: 'module'
			});
			guardWorker(worker, 'privateAi');
			wllamaApi = wrap<WllamaApi>(worker);
		}
		return wllamaApi as unknown as Remote<LlmApi>;
	}
	if (!webllmApi) webllmApi = (await import('./webllm-client')).webLlmClient;
	return webllmApi;
}

class LlmStore {
	status = $state<PrivateStatus>('detecting');
	progress = $state(0);
	tier = $state<Tier | null>(null);
	errorMessage = $state<string | null>(null);
	/** Set when the browser refused to commit to keeping the weights, so the UI can
	 * warn BEFORE spending gigabytes. Cleared by proceeding or by cancelling. */
	storageRisk = $state(false);
	/** True when weights are cached from a previous session (fast load). */
	prepared = $state(false);
	lastMetrics = $state<Omit<GenerationResult, 'text'> | null>(null);

	downloadLabel = $derived(this.tier?.downloadLabel ?? '');

	async init(): Promise<void> {
		if (this.status !== 'detecting') return;
		try {
			const saved = localStorage.getItem(METRICS_KEY);
			if (saved) this.lastMetrics = JSON.parse(saved);
		} catch {
			// A corrupt optional benchmark must never block Private mode.
		}
		const forced = forcedTier();
		const tier = forced ?? (await detectTier());
		if (!tier) {
			this.status = 'unavailable';
			return;
		}
		this.tier = tier;
		this.prepared = localStorage.getItem(PREPARED_KEY) === tier.model;
		this.status = 'needs-download';
		// Consent was given on the first preparation. Later visits reconnect to
		// the resident production worker or load weights from browser cache.
		// Forcing a tier is itself the instruction to load it: the harness has no
		// other way to reach this instance, and waiting for a click it will never
		// receive is what left benchmark runs stalled on a disabled button.
		if (this.prepared || forced) void this.prepare();
	}

	/** Explicit user consent → download (or fast cache load) then ready.
	 *
	 * `force` skips the storage warning, for someone who has read it and wants the
	 * download anyway. */
	async prepare(options: { force?: boolean } = {}): Promise<void> {
		if (
			!this.tier ||
			this.status === 'downloading' ||
			this.status === 'loading' ||
			this.status === 'ready'
		)
			return;
		this.status = this.prepared ? 'loading' : 'downloading';
		this.progress = 0;
		try {
			// Ask for persistent storage BEFORE the download, and stop if it is
			// refused.
			//
			// Refusal is the only trustworthy signal left. Reading the quota used to
			// betray a private window (Chrome capped the reported figure at ~120 MB),
			// but Chrome now ships "predictable reported storage quota" — an
			// artificial figure in every mode, precisely so quota cannot be used as a
			// private-browsing side channel. That is why this app's own preflight
			// admitted a 5 GB model into a window that could hold 1.1 GB, and why the
			// download died at 23%, downgraded, and died again at 46%.
			//
			// persist() is not a side channel: it is the browser answering whether it
			// will commit to keeping the data. A private window always says no. A
			// normal window that says no is also worth stopping for, because the same
			// eviction is coming. Either way the person decides, having been told.
			if (!this.prepared && !options.force) {
				const persisted = await navigator.storage?.persist?.().catch(() => false);
				if (!persisted) {
					this.storageRisk = true;
					this.status = 'needs-download';
					return;
				}
			}
			this.storageRisk = false;
			await (
				await getWorker(this.tier.engine)
			).load(
				this.tier.model,
				proxy((p: number) => {
					this.progress = p;
					if (this.prepared) return;
					this.status = 'downloading';
				})
			);
			localStorage.setItem(PREPARED_KEY, this.tier.model);
			this.prepared = true;
			this.status = 'ready';
		} catch (err) {
			console.error('[regeste] private engine load failed:', err);
			const message = err instanceof Error ? err.message : String(err);
			// Storage or memory, and the distinction decides both the message and
			// whether retrying smaller is worth the bandwidth.
			//
			// "Failed to execute 'add' on 'Cache': Unexpected internal error" is how
			// Chrome reports a cache write it could not complete, and it carries
			// neither "quota" nor "storage" in its text. Matching only those two
			// words told a visitor whose browser had refused to store the weights
			// that their device had run out of memory, and sent them closing tabs
			// for a problem no tab was causing.
			const storageFailure = /quota|storage|exceeded/i.test(message) || /on 'Cache'/.test(message);

			// Downgrading assumes the failure was about capability. On a storage
			// failure it is not: a window that cannot hold five gigabytes will not
			// hold two either, and each attempt re-downloads the whole model through
			// the deployment's own proxy. Fail once and say why.
			if (!storageFailure) {
				const lower = this.tier ? downgrade(this.tier) : null;
				if (lower) {
					this.tier = lower;
					this.prepared = localStorage.getItem(PREPARED_KEY) === lower.model;
					return this.prepare({ force: true });
				}
			}
			this.status = 'error';
			// A window that refuses to persist and then refuses to store is almost
			// always a private one, which is the single most common way to meet this
			// error. Naming it beats a generic "free up disk space" that will not
			// help, and it is a check rather than a guess about the browser.
			const ephemeral =
				storageFailure && !(await navigator.storage?.persisted?.().catch(() => false));
			this.errorMessage = storageFailure
				? ephemeral
					? t('llm.error.ephemeral')
					: t('llm.error.storage')
				: t('llm.error.memory');
		}
	}

	async generate(
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
		onDelta: (delta: string) => void,
		options: GenerationOptions = { reasoning: 'off', maxTokens: 320 }
	): Promise<string> {
		if (this.status !== 'ready' || !this.tier) throw new Error('private engine not ready');
		this.status = 'generating';
		try {
			const result = await (
				await getWorker(this.tier.engine)
			).generate(messages, proxy(onDelta), adaptGenerationOptions(options, this.tier.engine));
			this.lastMetrics = {
				ttftMs: result.ttftMs,
				tokensPerSecond: result.tokensPerSecond,
				completionTokens: result.completionTokens
			};
			localStorage.setItem(METRICS_KEY, JSON.stringify(this.lastMetrics));
			return result.text;
		} finally {
			this.status = 'ready';
		}
	}

	async stop(): Promise<void> {
		if (this.status === 'generating' && this.tier)
			await (await getWorker(this.tier.engine)).abort();
	}
}

export const llmStore = new LlmStore();
