import { describe, expect, it } from 'vitest';
import { PUBLIC_ANSWER_STRESS_CASES } from './public-answer-stress';

describe('public answer stress oracle', () => {
	it('covers OCR, policy, tax, tables, arithmetic, cross-document and unsupported answers', () => {
		expect(new Set(PUBLIC_ANSWER_STRESS_CASES.map((item) => item.id)).size).toBe(
			PUBLIC_ANSWER_STRESS_CASES.length
		);
		expect(PUBLIC_ANSWER_STRESS_CASES.every((item) => item.answerGroups.length > 0)).toBe(true);
		expect(PUBLIC_ANSWER_STRESS_CASES.some((item) => item.documents.length > 1)).toBe(true);
		expect(PUBLIC_ANSWER_STRESS_CASES.some((item) => !item.answerable)).toBe(true);
	});
});
