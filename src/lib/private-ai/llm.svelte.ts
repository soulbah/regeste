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
import { downgrade, type Tier } from './tiers';
import type { LlmApi } from './llm-worker';
import type { WllamaApi } from './wllama-worker';

const PREPARED_KEY = 'folio:private-prepared-model';

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
let webllmApi: Remote<LlmApi> | null = null;
let wllamaApi: Remote<WllamaApi> | null = null;
function getWorker(engine: 'webllm' | 'wllama'): Remote<LlmApi> {
	if (engine === 'wllama') {
		if (!wllamaApi) {
			const worker = new Worker(new URL('./wllama-worker.ts', import.meta.url), {
				type: 'module'
			});
			wllamaApi = wrap<WllamaApi>(worker);
		}
		return wllamaApi as unknown as Remote<LlmApi>;
	}
	if (!webllmApi) {
		const worker = new Worker(new URL('./llm-worker.ts', import.meta.url), { type: 'module' });
		webllmApi = wrap<LlmApi>(worker);
	}
	return webllmApi;
}

class LlmStore {
	status = $state<PrivateStatus>('detecting');
	progress = $state(0);
	tier = $state<Tier | null>(null);
	errorMessage = $state<string | null>(null);
	/** True when weights are cached from a previous session (fast load). */
	prepared = $state(false);

	downloadLabel = $derived(this.tier?.downloadLabel ?? '');

	async init(): Promise<void> {
		if (this.status !== 'detecting') return;
		const tier = await detectTier();
		if (!tier) {
			this.status = 'unavailable';
			return;
		}
		this.tier = tier;
		this.prepared = localStorage.getItem(PREPARED_KEY) === tier.model;
		this.status = 'needs-download';
	}

	/** Explicit user consent → download (or fast cache load) then ready. */
	async prepare(): Promise<void> {
		if (!this.tier || this.status === 'downloading' || this.status === 'ready') return;
		this.status = this.prepared ? 'loading' : 'downloading';
		this.progress = 0;
		try {
			await getWorker(this.tier.engine).load(
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
			console.error('[folio] private engine load failed:', err);
			const lower = this.tier ? downgrade(this.tier) : null;
			if (lower) {
				this.tier = lower;
				this.prepared = localStorage.getItem(PREPARED_KEY) === lower.model;
				return this.prepare();
			}
			this.status = 'error';
			this.errorMessage =
				'Your device ran out of memory preparing the private AI. Try closing other tabs and retry.';
		}
	}

	async generate(
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
		onDelta: (delta: string) => void
	): Promise<string> {
		if (this.status !== 'ready' || !this.tier) throw new Error('private engine not ready');
		this.status = 'generating';
		try {
			return await getWorker(this.tier.engine).generate(messages, proxy(onDelta));
		} finally {
			this.status = 'ready';
		}
	}

	async stop(): Promise<void> {
		if (this.status === 'generating' && this.tier) await getWorker(this.tier.engine).abort();
	}
}

export const llmStore = new LlmStore();
