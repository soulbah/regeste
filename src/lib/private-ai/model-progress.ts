export interface ModelProgressDisplay {
	/** Honest visual value for a 0..100 progress component. */
	value: number;
	/** Human label; sub-percent work must never be rounded back to 0%. */
	label: string;
}

/** Null means no measured byte yet and consumers should render indeterminate. */
export function modelProgressDisplay(progress: number): ModelProgressDisplay | null {
	if (!Number.isFinite(progress) || progress <= 0) return null;
	const percent = Math.min(progress, 1) * 100;
	if (percent < 1) return { value: 1, label: '<1%' };
	const value = Math.floor(percent);
	return { value, label: `${value}%` };
}
