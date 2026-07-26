import { describe, expect, it } from 'vitest';
import {
	downgrade,
	eligibleTiers,
	grantedBufferMB,
	pickTier,
	TIERS,
	type DeviceSignals
} from './tiers';

const GIB = 1024 * 1024 * 1024;

/** A capable desktop GPU, with every optional signal present. */
const signals = (over: Partial<DeviceSignals> = {}): DeviceSignals => ({
	hasWebGpu: true,
	hasF16: true,
	maxBufferBytes: 4 * GIB,
	maxStorageBindingBytes: 4 * GIB,
	storageQuotaBytes: 60_000_000_000,
	storageUsageBytes: 1_000_000_000,
	deviceMemory: 16,
	hardwareConcurrency: 12,
	isolated: true,
	...over
});

/** Safari and Firefox implement neither deviceMemory nor a truthful core count;
 * Safari returns only 4 or 8, and a random 1..63 under tracking protection. */
const nonChromium = (over: Partial<DeviceSignals> = {}) =>
	signals({ deviceMemory: null, hardwareConcurrency: 8, ...over });

describe('pickTier', () => {
	it('never hands a capable non-Chromium machine the smallest model', () => {
		// The previous gate read a missing deviceMemory as zero, so every Firefox
		// and Safari user landed on the 1B tier no matter their hardware.
		const chosen = pickTier(nonChromium());
		expect(chosen?.id).toBe('max');
		expect(chosen?.model).toBe('Qwen3.5-4B-q4f16_1-MLC');
	});

	it('does not gate on a core count Safari cannot report', () => {
		// WebKit returns only 4 or 8, so any threshold above 8 is unreachable
		// there by construction, and it is randomised under tracking protection.
		for (const cores of [4, 8, 63, 2]) {
			expect(pickTier(nonChromium({ hardwareConcurrency: cores }))?.id).toBe('max');
		}
	});

	it('lets deviceMemory promote, and scales the choice with it', () => {
		expect(pickTier(signals({ deviceMemory: 32 }))?.id).toBe('xl');
		expect(pickTier(signals({ deviceMemory: 16 }))?.id).toBe('large');
		expect(pickTier(signals({ deviceMemory: 8 }))?.id).toBe('mid');
		// A small machine still gets the lightest rung, not nothing.
		expect(pickTier(signals({ deviceMemory: 2 }))?.id).toBe('tiny');
	});

	it('respects the per-buffer grant, which is binary in web-llm 0.2.84', () => {
		// Below 1 GiB the engine asks for a fixed 256 MiB rather than what the
		// adapter offers, so only models whose largest tensor fits may bind.
		const small = signals({
			maxBufferBytes: 512 * 1024 * 1024,
			maxStorageBindingBytes: 512 * 1024 * 1024
		});
		expect(grantedBufferMB(small)).toBe(256);
		const ids = eligibleTiers(small).map((tier) => tier.id);
		expect(ids).not.toContain('xl'); // 485 MiB tensor
		expect(ids).not.toContain('max'); // 304 MiB tensor
		// Counterintuitive but measured: the 8B binds where the 4B cannot.
		expect(ids).toContain('large'); // 251 MiB tensor
		expect(ids).toContain('mid');
	});

	it('offers nothing from MLC when the adapter cannot even meet the fallback', () => {
		const tiny = signals({
			maxBufferBytes: 128 * 1024 * 1024,
			maxStorageBindingBytes: 128 * 1024 * 1024
		});
		expect(grantedBufferMB(tiny)).toBe(0);
		expect(eligibleTiers(tiny).every((tier) => tier.engine === 'wllama')).toBe(true);
	});

	it('keeps the weights from evicting the library', () => {
		// A quota that cannot hold the download plus the user's documents.
		const cramped = signals({ storageQuotaBytes: 2_600_000_000, storageUsageBytes: 0 });
		const ids = eligibleTiers(cramped).map((tier) => tier.id);
		expect(ids).not.toContain('xl');
		expect(ids).not.toContain('max'); // 2.39 GB + headroom exceeds 2.6 GB
		expect(ids).toContain('mid');
		// An unknown quota must not be read as a full one.
		expect(eligibleTiers(signals({ storageQuotaBytes: null })).map((t) => t.id)).toContain('xl');
	});

	it('uses the f32 rung when shader-f16 is missing, as on every Qualcomm GPU', () => {
		expect(pickTier(signals({ hasF16: false }))?.id).toBe('small-f32');
	});

	it('falls back to CPU inference only when it is worth attempting', () => {
		expect(pickTier(signals({ hasWebGpu: false }))?.id).toBe('lite');
		expect(pickTier(signals({ hasWebGpu: false, isolated: false }))).toBeNull();
		expect(pickTier(signals({ hasWebGpu: false, hardwareConcurrency: 2 }))).toBeNull();
	});
});

describe('the ladder', () => {
	it('descends by what gates loading, so one downgrade is a small concession', () => {
		// VRAM, not download size: the two disagree at the bottom of the ladder,
		// and it is VRAM that decides whether the weights bind.
		const webgpu = TIERS.filter((tier) => tier.engine === 'webllm' && tier.requiresF16);
		const vram = webgpu.map((tier) => tier.vramMB);
		expect(vram).toEqual([...vram].sort((a, b) => b - a));
		// No rung is close to double the one below it — that is what makes the
		// ladder dense enough for a machine to land near what it can run.
		for (let index = 0; index < vram.length - 1; index++) {
			expect(vram[index] / vram[index + 1]).toBeLessThan(1.9);
		}
	});

	it('steps down one rung at a time and ends at null', () => {
		let tier = TIERS[0];
		const walked = [tier.id];
		for (let step = 0; step < TIERS.length; step++) {
			const next = downgrade(tier);
			if (!next) break;
			tier = next;
			walked.push(tier.id);
		}
		expect(walked).toEqual(TIERS.map((candidate) => candidate.id));
		expect(downgrade(TIERS[TIERS.length - 1])).toBeNull();
	});
});
