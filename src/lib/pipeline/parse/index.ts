// Format dispatch shared by ingest (documents store) and the document viewer.

import { parseText } from './text';
import type { ParsedDoc } from '$lib/types';

export function isPdf(name: string, mime: string): boolean {
	return mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
}

export async function parseByName(
	name: string,
	mime: string,
	data: ArrayBuffer
): Promise<ParsedDoc> {
	const lower = name.toLowerCase();
	if (isPdf(name, mime)) {
		const { parsePdf } = await import('./pdf');
		return parsePdf(data);
	}
	if (lower.endsWith('.docx')) {
		const { parseDocx } = await import('./docx');
		return parseDocx(data);
	}
	if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
		return parseText(new TextDecoder().decode(data), true);
	}
	if (lower.endsWith('.txt') || mime.startsWith('text/')) {
		return parseText(new TextDecoder().decode(data), false);
	}
	throw Object.assign(new Error(`Unsupported format: ${name}`), {
		code: 'unsupported_format' as const
	});
}
