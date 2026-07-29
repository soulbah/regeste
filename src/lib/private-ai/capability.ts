// Device capability detection. Heuristic only — the ground truth is
// attempt-and-catch at engine load (see llm.svelte.ts downgrade path).
//
// Everything here is read defensively: a signal a browser does not implement
// must arrive as null so the tier logic can treat it as unknown. Reading it as
// zero is what pinned every Firefox and Safari user to the smallest model.

import { pickTier, eligibleTiers, type DeviceSignals, type Tier } from './tiers';

export async function detectSignals(): Promise<DeviceSignals> {
	let hasWebGpu: boolean;
	let hasF16 = false;
	let maxBufferBytes: number | null = null;
	let maxStorageBindingBytes: number | null = null;
	try {
		const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
		const adapter = gpu ? await gpu.requestAdapter() : null;
		hasWebGpu = !!adapter;
		hasF16 = !!adapter?.features.has('shader-f16');
		// The adapter limits are the only capability numbers the WebGPU spec
		// requires every implementation to expose, which makes them the one
		// signal that behaves identically in Chrome, Firefox and Safari.
		maxBufferBytes = adapter ? Number(adapter.limits.maxBufferSize) : null;
		maxStorageBindingBytes = adapter ? Number(adapter.limits.maxStorageBufferBindingSize) : null;
		// WebLLM's kernels bind ten storage buffers per shader stage. Firefox
		// caps that at eight, so an adapter exists, reports f16, passes every
		// size check, and then fails at runtime with "requested=10, limit=8" —
		// after the weights have already been downloaded. Treating the adapter
		// as absent moves that refusal to before the download, where it can be
		// acted on, and hands the user the CPU tier instead.
		if (adapter && Number(adapter.limits.maxStorageBuffersPerShaderStage) < 10) {
			hasWebGpu = false;
			hasF16 = false;
		}
	} catch {
		hasWebGpu = false;
	}

	let storageQuotaBytes: number | null = null;
	let storageUsageBytes: number | null = null;
	try {
		const estimate = await navigator.storage?.estimate?.();
		storageQuotaBytes = estimate?.quota ?? null;
		storageUsageBytes = estimate?.usage ?? null;
	} catch {
		// An unknown quota is not a small quota.
	}

	return {
		hasWebGpu,
		hasF16,
		maxBufferBytes,
		maxStorageBindingBytes,
		storageQuotaBytes,
		storageUsageBytes,
		deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
		hardwareConcurrency: navigator.hardwareConcurrency ?? 4,
		isolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
	};
}

export async function detectTier(): Promise<Tier | null> {
	return pickTier(await detectSignals());
}

/** Every tier this machine could attempt, best first, for the download choice. */
export async function detectEligibleTiers(): Promise<Tier[]> {
	return eligibleTiers(await detectSignals());
}
