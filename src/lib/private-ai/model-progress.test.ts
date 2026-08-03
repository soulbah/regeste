import { describe, expect, it } from 'vitest';
import { modelProgressDisplay } from './model-progress';

describe('model progress display', () => {
	it('keeps an unmeasured start indeterminate', () => {
		expect(modelProgressDisplay(0)).toBeNull();
		expect(modelProgressDisplay(Number.NaN)).toBeNull();
	});

	it('shows positive sub-percent work without claiming zero', () => {
		expect(modelProgressDisplay(0.004)).toEqual({ value: 1, label: '<1%' });
	});

	it('never rounds measured progress ahead', () => {
		expect(modelProgressDisplay(0.429)).toEqual({ value: 42, label: '42%' });
		expect(modelProgressDisplay(1.2)).toEqual({ value: 100, label: '100%' });
	});
});
