// Device capability detection. Heuristic only — the ground truth is
// attempt-and-catch at engine load (see llm.svelte.ts downgrade path).

import { pickTier, type DeviceSignals, type Tier } from './tiers';

export async function detectSignals(): Promise<DeviceSignals> {
	let hasWebGpu: boolean;
	let hasF16 = false;
	try {
		const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
		const adapter = gpu ? await gpu.requestAdapter() : null;
		hasWebGpu = !!adapter;
		hasF16 = !!adapter?.features.has('shader-f16');
	} catch {
		hasWebGpu = false;
	}
	const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
	return {
		hasWebGpu,
		hasF16,
		deviceMemory,
		hardwareConcurrency: navigator.hardwareConcurrency ?? 4,
		isolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
	};
}

export async function detectTier(): Promise<Tier | null> {
	return pickTier(await detectSignals());
}
