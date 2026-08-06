// Device capability detection. Heuristic only — the ground truth is
// attempt-and-catch at engine load (see llm.svelte.ts downgrade path).
//
// Everything here is read defensively: a signal a browser does not implement
// must arrive as null so the tier logic can treat it as unknown. Reading it as
// zero is what pinned every Firefox and Safari user to the smallest model.

import { pickTier, type DeviceSignals, type Tier } from './tiers';

/** What web-llm asks `requestDevice` for, mirrored from its own
 * `detectGPUDevice` (@mlc-ai/web-llm lib/index.js). Two of these are hard
 * gates it throws on, and one — the ten storage buffers — is above the WebGPU
 * default of eight, so it is the one adapters actually refuse. */
const WEBLLM_STORAGE_BUFFERS_PER_STAGE = 10;
const WEBLLM_WORKGROUP_STORAGE_SIZE = 32 << 10;
const WEBLLM_PREFERRED_BUFFER_SIZE = 1 << 30; // 1 GiB
const WEBLLM_FALLBACK_BUFFER_SIZE = 1 << 28; // 256 MiB
const WEBLLM_PREFERRED_BINDING_SIZE = 1 << 30; // 1 GiB
const WEBLLM_FALLBACK_BINDING_SIZE = 1 << 27; // 128 MiB

/**
 * Can web-llm actually start on this adapter?
 *
 * Asked by doing what web-llm does — requesting a device with its limits —
 * rather than by comparing one number against a constant. The distinction is
 * not academic: this file used to hard-code "a device reporting fewer than ten
 * storage buffers per stage has no usable WebGPU", which threw away a working
 * adapter on every engine that ships the spec default of eight, and would have
 * kept throwing it away after the engine or the library changed.
 *
 * A probe answers for the adapter in front of us, needs no browser detection,
 * and self-corrects: the day an engine raises its limit or web-llm lowers its
 * demand, this returns true on its own. The cost is one device that is created
 * and immediately destroyed.
 */
async function canRunWebLlm(adapter: GPUAdapter): Promise<boolean> {
	// web-llm asks for 1 GiB and retries smaller before giving up. Mirror that,
	// so the probe fails exactly where the engine would fail.
	const bufferSize =
		adapter.limits.maxBufferSize >= WEBLLM_PREFERRED_BUFFER_SIZE
			? WEBLLM_PREFERRED_BUFFER_SIZE
			: WEBLLM_FALLBACK_BUFFER_SIZE;
	const bindingSize =
		adapter.limits.maxStorageBufferBindingSize >= WEBLLM_PREFERRED_BINDING_SIZE
			? WEBLLM_PREFERRED_BINDING_SIZE
			: WEBLLM_FALLBACK_BINDING_SIZE;
	let device: GPUDevice | null = null;
	try {
		device = await adapter.requestDevice({
			requiredLimits: {
				maxBufferSize: bufferSize,
				maxStorageBufferBindingSize: bindingSize,
				maxComputeWorkgroupStorageSize: WEBLLM_WORKGROUP_STORAGE_SIZE,
				maxStorageBuffersPerShaderStage: WEBLLM_STORAGE_BUFFERS_PER_STAGE
			},
			requiredFeatures: adapter.features.has('shader-f16') ? ['shader-f16'] : []
		});
		return true;
	} catch {
		// The spec rejects requestDevice when a required limit is better than the
		// adapter supports. That rejection IS the answer.
		return false;
	} finally {
		// A probe must not hold a device: the engine requests its own later.
		device?.destroy();
	}
}

async function detectSignals(): Promise<DeviceSignals> {
	let hasWebGpu: boolean;
	let webllmCapable = false;
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
		// Whether web-llm can start is a separate question from whether WebGPU
		// exists, and conflating them cost every Firefox user their GPU: the
		// adapter is real and drives the embedding model perfectly well, it just
		// cannot host these particular kernels. Ask each question once, keep both
		// answers, and let the tier logic use the one it needs.
		webllmCapable = adapter ? await canRunWebLlm(adapter) : false;
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
		webllmCapable,
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
