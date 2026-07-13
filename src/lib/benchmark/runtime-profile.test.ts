import { describe, expect, it } from 'vitest';
import { benchmarkRuntimeProfile } from './runtime-profile';

describe('benchmark runtime profile', () => {
	it('records the execution profile without document or query data', () => {
		const report = benchmarkRuntimeProfile(
			{
				userAgent: 'Chromium test',
				platform: 'macOS',
				hardwareConcurrency: 8,
				deviceMemory: 8,
				gpu: {}
			} as Navigator & { deviceMemory: number; gpu: unknown },
			true
		);
		expect(report).toEqual({
			userAgent: 'Chromium test',
			platform: 'macOS',
			hardwareConcurrency: 8,
			deviceMemoryGiB: 8,
			crossOriginIsolated: true,
			webGpu: true
		});
		expect(JSON.stringify(report)).not.toMatch(/document|question|chunk/i);
	});
});
