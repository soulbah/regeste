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
import { downgrade, largestFitting, STORAGE_HEADROOM, TIERS, type Tier } from './tiers';
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

/**
 * How many rungs the app will step down on its own before it stops and asks.
 *
 * Two, not unlimited: the first failure is information and acting on it saves
 * the person a decision they have no way to make better than we can. A device
 * that has failed three times is telling us the ladder is not the problem, and
 * carrying on would spend gigabytes of someone's bandwidth proving it.
 */
const MAX_AUTO_STEPS = 2;

/** What this origin can still write, or null when the browser will not say. */
async function freeStorageBytes(): Promise<number | null> {
	try {
		const estimate = await navigator.storage?.estimate?.();
		if (!estimate || typeof estimate.quota !== 'number') return null;
		return estimate.quota - (estimate.usage ?? 0);
	} catch {
		return null;
	}
}

/** Why a load attempt ended. Storage and memory need different recoveries. */
type LoadFailure = 'storage' | 'memory';

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
	/** Set when this origin measurably cannot hold the weights, so the UI can say so
	 * BEFORE spending gigabytes. Cleared by proceeding or by cancelling. */
	storageRisk = $state(false);
	/** Free bytes measured at the moment the risk was raised, so the warning can
	 * state the shortfall instead of asserting one. */
	storageFreeBytes = $state<number | null>(null);
	/** A smaller rung offered after the app has already stepped down as far as it
	 * will on its own. Taking it is then a choice, because two attempts have
	 * already failed and a third is worth agreeing to. */
	smallerTier = $state<Tier | null>(null);
	/** Set while a download is running that the app chose after a failure, so the
	 * screen can say why the size changed under the reader. Cleared once ready. */
	steppedDownTo = $state<Tier | null>(null);
	/** True when weights are cached from a previous session (fast load). */
	prepared = $state(false);
	lastMetrics = $state<Omit<GenerationResult, 'text'> | null>(null);

	downloadLabel = $derived(this.tier?.downloadLabel ?? '');

	/** Back to before init(), for the landing demo which borrows this store to
	 * render the real app components and must not leave its fixture behind: the
	 * chat is the same page, so a pinned 'ready' with no tier followed the reader
	 * in and left Private mode claiming a model that was never chosen. */
	reset(): void {
		this.status = 'detecting';
		this.progress = 0;
		this.tier = null;
		this.errorMessage = null;
		this.storageRisk = false;
		this.storageFreeBytes = null;
		this.smallerTier = null;
		this.steppedDownTo = null;
		this.prepared = false;
	}

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

	/** Take the rung offered once the app has stopped stepping down on its own.
	 * Forced past the space check because they have already read what it says. */
	async acceptSmaller(): Promise<void> {
		if (!this.smallerTier) return;
		this.tier = this.smallerTier;
		this.smallerTier = null;
		this.errorMessage = null;
		this.steppedDownTo = null;
		this.prepared = localStorage.getItem(PREPARED_KEY) === this.tier.model;
		this.status = 'needs-download';
		await this.prepare({ force: true });
	}

	/** Explicit user consent → download (or fast cache load) then ready.
	 *
	 * `force` skips the space warning, for someone who has read it and wants the
	 * download anyway. */
	async prepare(options: { force?: boolean } = {}): Promise<void> {
		if (
			!this.tier ||
			this.status === 'downloading' ||
			this.status === 'loading' ||
			this.status === 'ready'
		)
			return;

		// Ask for persistent storage, and carry on whatever the answer is.
		//
		// It used to be a gate, and it was the wrong one. Chromium "automatically
		// approve[s] or den[ies] the request based on the user's history of
		// interaction with the site" (MDN, Storage quotas and eviction criteria) —
		// it is a statement about how often someone has visited, never about how
		// much room they have. So a first-time visitor in an ordinary window was
		// told their download "would very likely fail partway", and it then
		// succeeded. A warning that fires for everyone and is wrong for almost all
		// of them is worse than no warning.
		//
		// The ask stays, because a yes is worth having: it moves the weights and the
		// user's library out of the evictable bucket.
		if (!this.prepared) await navigator.storage?.persist?.().catch(() => false);

		// The real question is whether the bytes fit, and that one has a measurement.
		// Not a perfect one — a private window reports an ordinary-looking quota on
		// purpose, so this cannot catch that case — but when it does fire it is a
		// fact with numbers, and the step-down below covers what it misses.
		if (!this.prepared && !options.force) {
			const free = await freeStorageBytes();
			if (free !== null && free < this.tier.downloadBytes * STORAGE_HEADROOM) {
				this.storageRisk = true;
				this.storageFreeBytes = free;
				this.status = 'needs-download';
				return;
			}
		}
		this.storageRisk = false;
		this.steppedDownTo = null;

		// Step down and retry rather than stop and ask.
		//
		// The person asked for a model that answers on this device; a rung that
		// turned out not to fit is not a new decision for them to make, it is this
		// one still in progress. So the app takes the step it would have recommended
		// anyway and says what it did, which is the difference between recovering
		// and interrogating. It stops after MAX_AUTO_STEPS, where a step really has
		// become a question.
		//
		// A loop, not recursion: the old code called prepare() again from its own
		// catch, and prepare() returns immediately while the status is 'downloading'.
		// So the retry never ran, the error branch after it never ran either, and the
		// bar froze at the percentage it died on with no message at all — on exactly
		// the marginal devices the downgrade existed for.
		for (let step = 0; ; step++) {
			const failure = await this.attempt();
			if (!failure) {
				this.steppedDownTo = null;
				return;
			}
			// Annotated, or TypeScript reads `this.tier = next` as making the field's
			// own type depend on itself and gives up on both.
			const current: Tier | null = this.tier;
			const next: Tier | null = current ? await this.rungAfter(current, failure) : null;
			if (next && step < MAX_AUTO_STEPS) {
				this.tier = next;
				this.steppedDownTo = next;
				this.prepared = localStorage.getItem(PREPARED_KEY) === next.model;
				continue;
			}
			await this.reportFailure(failure, next);
			return;
		}
	}

	/** One load, start to finish. Resolves to null on success, or to why it ended. */
	private async attempt(): Promise<LoadFailure | null> {
		if (!this.tier) return 'memory';
		this.status = this.prepared ? 'loading' : 'downloading';
		this.progress = 0;
		this.errorMessage = null;
		try {
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
			return null;
		} catch (err) {
			console.error('[regeste] private engine load failed:', err);
			const message = err instanceof Error ? err.message : String(err);
			// Storage or memory, and the distinction decides both the message and
			// which rung to try next.
			//
			// "Failed to execute 'add' on 'Cache': Unexpected internal error" is how
			// Chrome reports a cache write it could not complete, and it carries
			// neither "quota" nor "storage" in its text. Matching only those two
			// words told a visitor whose browser had refused to store the weights
			// that their device had run out of memory, and sent them closing tabs
			// for a problem no tab was causing.
			return /quota|storage|exceeded/i.test(message) || /on 'Cache'/.test(message)
				? 'storage'
				: 'memory';
		}
	}

	/** The rung to try next, or null when there is nothing worth trying. */
	private async rungAfter(tier: Tier, failure: LoadFailure): Promise<Tier | null> {
		if (failure === 'memory') return downgrade(tier);
		// Space, so the ladder is not the measure — the space is. Ask again after the
		// failure, because a partial download leaves bytes behind and the number that
		// matters is the one now.
		const free = await freeStorageBytes();
		return free === null ? downgrade(tier) : largestFitting(tier, free);
	}

	/** `offer` is the rung that exists but that the app stopped short of taking,
	 * which is precisely when handing the choice over is worth doing: null means
	 * there was nothing left to try, and inviting a third download would be a lie. */
	private async reportFailure(failure: LoadFailure, offer: Tier | null): Promise<void> {
		this.status = 'error';
		this.steppedDownTo = null;
		this.smallerTier = offer;
		if (offer) {
			// Which of the two happened decides the sentence: "could not load that
			// much" sends someone to close tabs, "no room left" sends them to their
			// disk, and each is useless advice for the other problem.
			this.errorMessage = t(failure === 'storage' ? 'llm.error.noRoom' : 'llm.error.tooLarge', {
				size: offer.downloadLabel
			});
			return;
		}
		// A window that will not store the weights and has not been granted
		// persistence is almost always a private one, which is the single most
		// common way to meet this error and the one case the space check above
		// cannot see. Naming it beats a generic "free up disk space" that will not
		// help, and it is a check rather than a guess about the browser.
		if (failure === 'storage') {
			const persisted = await navigator.storage?.persisted?.().catch(() => false);
			this.errorMessage = persisted ? t('llm.error.storage') : t('llm.error.ephemeral');
			return;
		}
		this.errorMessage = t('llm.error.memory');
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
				completionTokens: result.completionTokens,
				grammarInitMs: result.grammarInitMs ?? null,
				grammarPerTokenMs: result.grammarPerTokenMs ?? null
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
