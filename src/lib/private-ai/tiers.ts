// Model tiers for Private mode. INTERNAL ONLY: tier/model names never reach
// the main UI (FEATURES 5bis — zero jargon); the UI speaks in download size
// and plain language. Model ids come from WebLLM's prebuilt catalog.

export interface Tier {
	id: 'standard' | 'standard-f32' | 'plus';
	model: string;
	downloadLabel: string; // shown to the user ("~0.7 GB")
	requiresF16: boolean;
}

export const TIERS: Tier[] = [
	{
		id: 'plus',
		model: 'Qwen3-1.7B-q4f16_1-MLC',
		downloadLabel: '~1.2 GB',
		requiresF16: true
	},
	{
		id: 'standard',
		model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
		downloadLabel: '~0.7 GB',
		requiresF16: true
	},
	{
		id: 'standard-f32',
		model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
		downloadLabel: '~0.9 GB',
		requiresF16: false
	}
];

export interface DeviceSignals {
	hasWebGpu: boolean;
	hasF16: boolean;
	/** navigator.deviceMemory (Chromium only, capped at 8) — null when unknown. */
	deviceMemory: number | null;
	hardwareConcurrency: number;
}

/** Pure mapping from device signals to a tier (or null = Private unavailable). */
export function pickTier(signals: DeviceSignals): Tier | null {
	if (!signals.hasWebGpu) return null;
	if (!signals.hasF16) return TIERS.find((t) => t.id === 'standard-f32')!;
	// Plus tier only with strong signals; unknown memory defaults to standard.
	if ((signals.deviceMemory ?? 0) >= 8 && signals.hardwareConcurrency >= 8) {
		return TIERS.find((t) => t.id === 'plus')!;
	}
	return TIERS.find((t) => t.id === 'standard')!;
}

/** One-step downgrade when a load fails (ground truth beats heuristics). */
export function downgrade(tier: Tier): Tier | null {
	if (tier.id === 'plus') return TIERS.find((t) => t.id === 'standard')!;
	if (tier.id === 'standard') return TIERS.find((t) => t.id === 'standard-f32')!;
	return null;
}
