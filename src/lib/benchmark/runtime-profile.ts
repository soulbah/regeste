export interface BenchmarkRuntimeProfile {
	userAgent: string;
	platform: string;
	hardwareConcurrency: number | null;
	deviceMemoryGiB: number | null;
	crossOriginIsolated: boolean;
	webGpu: boolean;
}

type NavigatorProfile = Navigator & { deviceMemory?: number; gpu?: unknown };

/** Non-identifying-enough local diagnostic shown only on the dev benchmark page. */
export function benchmarkRuntimeProfile(
	nav: NavigatorProfile = navigator,
	isolated = globalThis.crossOriginIsolated
): BenchmarkRuntimeProfile {
	return {
		userAgent: nav.userAgent,
		platform: nav.platform,
		hardwareConcurrency: nav.hardwareConcurrency || null,
		deviceMemoryGiB: nav.deviceMemory ?? null,
		crossOriginIsolated: isolated,
		webGpu: 'gpu' in nav
	};
}
