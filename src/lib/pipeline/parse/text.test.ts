import { describe, expect, it } from 'vitest';
import { parseText } from './text';

describe('plain-text structure', () => {
	it('propagates numbered RFC-style headings to following paragraphs', () => {
		const parsed = parseText(
			'9.3 Request Methods\n\n9.3.1. GET\n\nThe GET method requests transfer of a representation.\n\n9.3.2. HEAD\n\nThe server MUST NOT send content.',
			false
		);
		expect(parsed.blocks).toHaveLength(2);
		expect(parsed.blocks[0]).toMatchObject({ headingPath: ['9.3 Request Methods', '9.3.1 GET'] });
		expect(parsed.blocks[1]).toMatchObject({ headingPath: ['9.3 Request Methods', '9.3.2 HEAD'] });
	});

	it('does not reinterpret numbered prose as a heading', () => {
		const parsed = parseText('2026 was a productive year. It included several releases.', false);
		expect(parsed.blocks[0]).toMatchObject({
			text: '2026 was a productive year. It included several releases.'
		});
		expect(parsed.blocks[0].headingPath).toBeUndefined();
	});
});
