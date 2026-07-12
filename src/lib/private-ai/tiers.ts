// Model tiers for Private mode. INTERNAL ONLY: tier/model names never reach
// the main UI (FEATURES 5bis — zero jargon); the UI speaks in download size
// and plain language. WebLLM tiers use MLC catalog ids; the CPU Lite tier
// (spec 018) is a GGUF URL run by wllama, multithreaded via SharedArrayBuffer.

export interface Tier {
	id: 'standard' | 'standard-f32' | 'plus' | 'max' | 'lite';
	engine: 'webllm' | 'wllama';
	model: string;
	downloadLabel: string; // shown to the user ("~0.7 GB")
	requiresF16: boolean;
}

export const TIERS: Tier[] = [
	{
		id: 'max',
		engine: 'webllm',
		model: 'Qwen3.5-4B-q4f16_1-MLC',
		downloadLabel: '~2.4 GB',
		requiresF16: true
	},
	{
		id: 'plus',
		engine: 'webllm',
		model: 'Qwen3.5-2B-q4f16_1-MLC',
		downloadLabel: '~1.1 GB',
		requiresF16: true
	},
	{
		id: 'standard',
		engine: 'webllm',
		model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
		downloadLabel: '~0.7 GB',
		requiresF16: true
	},
	{
		id: 'standard-f32',
		engine: 'webllm',
		model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
		downloadLabel: '~0.9 GB',
		requiresF16: false
	},
	{
		id: 'lite',
		engine: 'wllama',
		model: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',
		downloadLabel: '~0.4 GB',
		requiresF16: false
	}
];

export interface DeviceSignals {
	hasWebGpu: boolean;
	hasF16: boolean;
	/** navigator.deviceMemory (Chromium only, capped at 8) — null when unknown. */
	deviceMemory: number | null;
	hardwareConcurrency: number;
	/** SharedArrayBuffer available (COOP/COEP) — required for the CPU tier. */
	isolated: boolean;
}

/** Pure mapping from device signals to a tier (or null = Private unavailable). */
export function pickTier(signals: DeviceSignals): Tier | null {
	if (!signals.hasWebGpu) {
		// CPU fallback: only worth shipping multithreaded on a few cores.
		if (signals.isolated && signals.hardwareConcurrency >= 4) {
			return TIERS.find((t) => t.id === 'lite')!;
		}
		return null;
	}
	if (!signals.hasF16) return TIERS.find((t) => t.id === 'standard-f32')!;
	// Plus tier only with strong signals; unknown memory defaults to standard.
	if ((signals.deviceMemory ?? 0) >= 8 && signals.hardwareConcurrency >= 12) {
		return TIERS.find((t) => t.id === 'max')!;
	}
	if ((signals.deviceMemory ?? 0) >= 8 && signals.hardwareConcurrency >= 8) {
		return TIERS.find((t) => t.id === 'plus')!;
	}
	return TIERS.find((t) => t.id === 'standard')!;
}

/** One-step downgrade when a load fails (ground truth beats heuristics). */
export function downgrade(tier: Tier): Tier | null {
	if (tier.id === 'max') return TIERS.find((t) => t.id === 'plus')!;
	if (tier.id === 'plus') return TIERS.find((t) => t.id === 'standard')!;
	if (tier.id === 'standard') return TIERS.find((t) => t.id === 'standard-f32')!;
	return null;
}
