// Model tiers for Private mode. INTERNAL ONLY: tier/model names never reach
// the main UI (FEATURES 5bis — zero jargon); the UI speaks in download size
// and plain language. WebLLM tiers use MLC catalog ids; the CPU Lite tier
// (spec 018) is a GGUF URL run by wllama, multithreaded via SharedArrayBuffer.
//
// Two rules decide everything here, both learned the hard way:
//
// 1. Never fail closed on a missing signal. `navigator.deviceMemory` is
//    Chromium-only — Firefox and Safari have never shipped it — so gating on
//    it handed every non-Chromium user the smallest model regardless of their
//    hardware. A signal that is absent means "unknown", never "small".
//
// 2. The per-buffer limit, not system RAM, is what decides whether weights
//    bind. web-llm 0.2.84 asks the adapter for a 1 GiB maxBufferSize and, if
//    the adapter offers less, substitutes a fixed 256 MiB rather than the
//    adapter's real value — so the effective grant is binary, and the only
//    thing that has to fit is each model's largest single tensor. That is why
//    Llama-3.1-8B (251 MiB) can bind where Qwen3.5-4B (304 MiB) cannot, even
//    though it is the bigger model.

export interface Tier {
	id: 'xl' | 'large' | 'max' | 'plus' | 'mid' | 'small' | 'tiny' | 'small-f32' | 'lite';
	engine: 'webllm' | 'wllama';
	model: string;
	downloadLabel: string; // shown to the user ("~2.4 GB")
	/** Measured from the model repository, for the storage-quota check. */
	downloadBytes: number;
	/** vram_required_MB from the installed MLC catalog. */
	vramMB: number;
	/** Largest single tensor, measured from the repo's tensor manifest. This is
	 * the value the per-buffer grant has to cover. */
	largestTensorMB: number;
	requiresF16: boolean;
}

const GB = 1_000_000_000;

/**
 * Descending by capability. The rungs are deliberately close together so a
 * machine lands near what it can actually run instead of on one of three
 * coarse steps. Every number below is measured, not estimated: download sizes
 * from the model repositories, VRAM from the installed catalog, largest tensor
 * from each repo's tensor manifest.
 */
export const TIERS: Tier[] = [
	{
		id: 'xl',
		engine: 'webllm',
		model: 'Qwen3.5-9B-q4f16_1-MLC',
		downloadLabel: '~5.1 GB',
		downloadBytes: 5.06 * GB,
		vramMB: 6433,
		largestTensorMB: 485,
		requiresF16: true
	},
	{
		id: 'large',
		engine: 'webllm',
		model: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
		downloadLabel: '~4.5 GB',
		downloadBytes: 4.53 * GB,
		vramMB: 5001,
		largestTensorMB: 251,
		requiresF16: true
	},
	{
		id: 'max',
		engine: 'webllm',
		model: 'Qwen3.5-4B-q4f16_1-MLC',
		downloadLabel: '~2.4 GB',
		downloadBytes: 2.39 * GB,
		vramMB: 3868,
		largestTensorMB: 304,
		requiresF16: true
	},
	{
		id: 'plus',
		engine: 'webllm',
		// French-native, and flagged low_resource_required in the catalog, which
		// fills the gap between the 2B and the 4B.
		model: 'Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC',
		downloadLabel: '~2.0 GB',
		downloadBytes: 1.95 * GB,
		vramMB: 2864,
		largestTensorMB: 192,
		requiresF16: true
	},
	{
		id: 'mid',
		engine: 'webllm',
		model: 'Qwen3.5-2B-q4f16_1-MLC',
		downloadLabel: '~1.1 GB',
		downloadBytes: 1.08 * GB,
		vramMB: 2245,
		largestTensorMB: 243,
		requiresF16: true
	},
	{
		id: 'small',
		engine: 'webllm',
		model: 'Qwen3.5-0.8B-q4f16_1-MLC',
		downloadLabel: '~0.5 GB',
		downloadBytes: 0.45 * GB,
		vramMB: 1629,
		largestTensorMB: 122,
		requiresF16: true
	},
	{
		id: 'tiny',
		engine: 'webllm',
		// The smallest rung that still runs on the GPU. Its download is larger
		// than the rung above it while its VRAM is much smaller — the ladder is
		// ordered by what gates loading, not by what the user downloads.
		model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
		downloadLabel: '~0.7 GB',
		downloadBytes: 0.7 * GB,
		vramMB: 879,
		largestTensorMB: 126,
		requiresF16: true
	},
	{
		id: 'small-f32',
		engine: 'webllm',
		// shader-f16 is structurally unavailable on Qualcomm/Adreno, so this rung
		// is the whole of Android and Windows-on-ARM, not an edge case.
		model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
		downloadLabel: '~0.9 GB',
		downloadBytes: 0.9 * GB,
		vramMB: 1129,
		largestTensorMB: 250,
		requiresF16: false
	},
	{
		id: 'lite',
		engine: 'wllama',
		// Same-origin proxy (see routes/cdn): a direct huggingface.co fetch fails
		// under the cross-origin isolation Private mode requires.
		model: '/cdn/huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',
		downloadLabel: '~0.4 GB',
		downloadBytes: 0.4 * GB,
		vramMB: 0,
		largestTensorMB: 0,
		requiresF16: false
	}
];

export interface DeviceSignals {
	hasWebGpu: boolean;
	hasF16: boolean;
	/** `adapter.limits.maxBufferSize`. Specified, mandatory and uniform across
	 * every WebGPU browser — unlike every other capability signal available. */
	maxBufferBytes: number | null;
	maxStorageBindingBytes: number | null;
	/** `navigator.storage.estimate()`: the weights have to fit beside the user's
	 * documents. A benchmark machine was once refused a 2.37 GB model by a
	 * 2.6 GB quota. */
	storageQuotaBytes: number | null;
	storageUsageBytes: number | null;
	/** Chromium-only, and it measures system RAM rather than anything the GPU
	 * cares about. It may promote a choice; it may never block one. */
	deviceMemory: number | null;
	/** Safari returns only 4 or 8, and a random 1..63 under tracking protection;
	 * Firefox pins it to 2 under RFP; Brave farbles it. Good enough to decide
	 * whether CPU inference is worth attempting, and nothing else. */
	hardwareConcurrency: number;
	/** SharedArrayBuffer available (COOP/COEP) — required for the CPU tier. */
	isolated: boolean;
}

/** web-llm asks for this much per buffer, and on refusal falls back to exactly
 * WEBLLM_FALLBACK_GRANT rather than to what the adapter actually offers. */
const WEBLLM_REQUESTED_GRANT = 1024 * 1024 * 1024;
const WEBLLM_FALLBACK_GRANT = 256 * 1024 * 1024;

/** Megabytes a model's largest tensor may occupy on this adapter, or 0 when no
 * MLC model can bind at all. */
export function grantedBufferMB(signals: DeviceSignals): number {
	const buffer = signals.maxBufferBytes ?? 0;
	const binding = signals.maxStorageBindingBytes ?? 0;
	if (buffer < WEBLLM_FALLBACK_GRANT || binding < WEBLLM_FALLBACK_GRANT) return 0;
	const granted =
		buffer >= WEBLLM_REQUESTED_GRANT && binding >= WEBLLM_REQUESTED_GRANT
			? WEBLLM_REQUESTED_GRANT
			: WEBLLM_FALLBACK_GRANT;
	return granted / (1024 * 1024);
}

/** A little headroom so the weights do not crowd out the user's own library. */
export const STORAGE_HEADROOM = 1.15;

function fitsIn(tier: Tier, freeBytes: number): boolean {
	return tier.downloadBytes * STORAGE_HEADROOM <= freeBytes;
}

function fitsStorage(tier: Tier, signals: DeviceSignals): boolean {
	if (signals.storageQuotaBytes === null) return true; // unknown is not "no"
	return fitsIn(tier, signals.storageQuotaBytes - (signals.storageUsageBytes ?? 0));
}

/** Every tier this machine could attempt, best first. The UI offers these, and
 * the user may choose among them, because no browser exposes what a GPU can
 * actually hold. */
export function eligibleTiers(signals: DeviceSignals): Tier[] {
	const cpuCapable = signals.isolated && signals.hardwareConcurrency >= 4;
	if (!signals.hasWebGpu) {
		return cpuCapable ? TIERS.filter((tier) => tier.engine === 'wllama') : [];
	}
	const grant = grantedBufferMB(signals);
	return TIERS.filter((tier) => {
		if (tier.engine === 'wllama') return cpuCapable;
		if (tier.requiresF16 && !signals.hasF16) return false;
		if (grant === 0 || tier.largestTensorMB > grant) return false;
		return fitsStorage(tier, signals);
	});
}

/**
 * What to offer by default. Deliberately not the largest eligible tier: with no
 * way to query GPU memory, an optimistic default would spend gigabytes of
 * someone's bandwidth on a download that then fails to load. Recommend a rung
 * the evidence supports, and let the user climb.
 */
export function pickTier(signals: DeviceSignals): Tier | null {
	const eligible = eligibleTiers(signals);
	if (!eligible.length) return null;
	const webgpu = eligible.filter((tier) => tier.engine === 'webllm');
	if (!webgpu.length) return eligible[0];

	// deviceMemory, when present, is the only direct read on what the machine
	// has to spare. Chrome 147+ reports 2/4/8/16/32 on desktop and 1/2/4/8 on
	// Android, so treat it as a coarse band. About a third of system memory is
	// a defensible working set for weights.
	const smallest = webgpu.reduce((low, tier) => (tier.vramMB < low.vramMB ? tier : low));
	if (signals.deviceMemory) {
		const budgetMB = signals.deviceMemory * 1024 * 0.34;
		return webgpu.find((tier) => tier.vramMB <= budgetMB) ?? smallest;
	}

	// No memory signal at all: Firefox, Safari, Brave. A full 1 GiB grant means
	// a desktop-class GPU, which runs the 2.4 GB rung comfortably; a fallback
	// grant means a small one. Either way the user can climb from here, and a
	// failed load steps back down.
	const conservative = grantedBufferMB(signals) >= 1024 ? 'max' : 'small';
	const ceiling = TIERS.findIndex((tier) => tier.id === conservative);
	return (
		webgpu.find((tier) => TIERS.findIndex((rung) => rung.id === tier.id) >= ceiling) ?? smallest
	);
}

/**
 * Where to retry after a load fails (ground truth beats heuristics).
 *
 * Density is for choosing, not for recovering. Stepping one rung would make a
 * failed 5.1 GB attempt pull 4.5 GB next and 2.4 GB after that, spending most
 * of a download budget discovering what one OOM already proved. A failure means
 * this machine cannot hold that much, so the retry drops to a rung that needs
 * materially less rather than to the neighbour.
 */
const RECOVERY_RATIO = 0.65;

export function downgrade(tier: Tier): Tier | null {
	const index = TIERS.findIndex((candidate) => candidate.id === tier.id);
	if (index < 0) return null;
	const rest = TIERS.slice(index + 1);
	// Below the WebGPU rungs sit the f32 and CPU paths, which exist for a
	// different reason (no shader-f16, no WebGPU) and stay reachable in order.
	return (
		rest.find((candidate) => candidate.vramMB <= tier.vramMB * RECOVERY_RATIO) ?? rest[0] ?? null
	);
}

/**
 * Where to retry after the *storage* ran out, which is a different question from
 * a failed load: the device could run the model, it just could not keep it. So
 * the rung is chosen by measured free space rather than by the recovery ratio,
 * and it is the largest one that fits — stepping further down would cost quality
 * for no reason.
 */
export function largestFitting(tier: Tier, freeBytes: number): Tier | null {
	const index = TIERS.findIndex((candidate) => candidate.id === tier.id);
	if (index < 0) return null;
	return TIERS.slice(index + 1).find((candidate) => fitsIn(candidate, freeBytes)) ?? null;
}
