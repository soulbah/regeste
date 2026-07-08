import { describe, expect, it } from 'vitest';
import { downgrade, pickTier, TIERS } from './tiers';

const signals = (over: Partial<Parameters<typeof pickTier>[0]>) => ({
	hasWebGpu: true,
	hasF16: true,
	deviceMemory: 8 as number | null,
	hardwareConcurrency: 8,
	...over
});

describe('pickTier', () => {
	it('returns null without WebGPU (Private unavailable)', () => {
		expect(pickTier(signals({ hasWebGpu: false }))).toBeNull();
	});

	it('uses the f32 variant when shader-f16 is missing', () => {
		expect(pickTier(signals({ hasF16: false }))?.id).toBe('standard-f32');
	});

	it('picks plus only with strong memory+cores signals', () => {
		expect(pickTier(signals({}))?.id).toBe('plus');
		expect(pickTier(signals({ deviceMemory: 4 }))?.id).toBe('standard');
		expect(pickTier(signals({ deviceMemory: null }))?.id).toBe('standard');
		expect(pickTier(signals({ hardwareConcurrency: 4 }))?.id).toBe('standard');
	});
});

describe('downgrade', () => {
	it('steps plus → standard → standard-f32 → null', () => {
		const plus = TIERS.find((t) => t.id === 'plus')!;
		const std = downgrade(plus)!;
		expect(std.id).toBe('standard');
		const f32 = downgrade(std)!;
		expect(f32.id).toBe('standard-f32');
		expect(downgrade(f32)).toBeNull();
	});
});
