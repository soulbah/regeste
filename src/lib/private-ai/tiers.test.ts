import { describe, expect, it } from 'vitest';
import { downgrade, pickTier, TIERS } from './tiers';

const signals = (over: Partial<Parameters<typeof pickTier>[0]>) => ({
	hasWebGpu: true,
	hasF16: true,
	deviceMemory: 8 as number | null,
	hardwareConcurrency: 8,
	isolated: true,
	...over
});

describe('pickTier', () => {
	it('falls back to the CPU lite tier without WebGPU when isolated + multicore', () => {
		expect(pickTier(signals({ hasWebGpu: false }))?.id).toBe('lite');
	});

	it('returns null without WebGPU when isolation or cores are missing', () => {
		expect(pickTier(signals({ hasWebGpu: false, isolated: false }))).toBeNull();
		expect(pickTier(signals({ hasWebGpu: false, hardwareConcurrency: 2 }))).toBeNull();
	});

	it('uses the f32 variant when shader-f16 is missing', () => {
		expect(pickTier(signals({ hasF16: false }))?.id).toBe('standard-f32');
	});

	it('picks plus only with strong memory+cores signals', () => {
		expect(pickTier(signals({}))?.id).toBe('plus');
		expect(pickTier(signals({ hardwareConcurrency: 12 }))?.id).toBe('max');
		expect(pickTier(signals({ deviceMemory: 4 }))?.id).toBe('standard');
		expect(pickTier(signals({ deviceMemory: null }))?.id).toBe('standard');
		expect(pickTier(signals({ hardwareConcurrency: 4 }))?.id).toBe('standard');
	});
});

describe('downgrade', () => {
	it('steps max → plus → standard → standard-f32 → null', () => {
		const max = TIERS.find((t) => t.id === 'max')!;
		const plus = TIERS.find((t) => t.id === 'plus')!;
		expect(downgrade(max)?.id).toBe('plus');
		const std = downgrade(plus)!;
		expect(std.id).toBe('standard');
		const f32 = downgrade(std)!;
		expect(f32.id).toBe('standard-f32');
		expect(downgrade(f32)).toBeNull();
	});
});
