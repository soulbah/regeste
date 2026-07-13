// Markdown / plain text: paragraphs split on blank lines; markdown headings
// (#, ##, …) build the breadcrumb used for citations.

import type { ParsedDoc, ParsedBlock } from '$lib/types';

function plainTextHeading(text: string): { section: string; label: string } | null {
	if (text.includes('\n') || text.length > 120) return null;
	const match = /^(\d+(?:\.\d+){0,5})\.?\s+([\p{L}][^.!?]{0,100})$/u.exec(text);
	if (!match) return null;
	return { section: match[1], label: `${match[1]} ${match[2].trim()}` };
}

export function parseText(raw: string, isMarkdown: boolean): ParsedDoc {
	const blocks: ParsedBlock[] = [];
	const headingPath: string[] = [];
	let paraIndex = 0;
	let offset = 0;

	for (const part of raw.split(/\n{2,}/)) {
		const text = part.trim();
		const start = raw.indexOf(part, offset);
		offset = start + part.length;
		if (!text) continue;

		const heading = isMarkdown ? /^(#{1,6})\s+(.*)$/.exec(text.split('\n')[0]) : null;
		if (heading) {
			headingPath.length = heading[1].length - 1;
			headingPath.push(heading[2].trim());
			const rest = text.split('\n').slice(1).join('\n').trim();
			paraIndex++;
			if (!rest) continue;
			blocks.push({
				text: rest,
				headingPath: [...headingPath],
				paraIndex,
				charStart: start,
				charEnd: start + part.length
			});
			paraIndex++;
			continue;
		}
		const structuralHeading = !isMarkdown ? plainTextHeading(text) : null;
		if (structuralHeading) {
			const parentSection = structuralHeading.section.split('.').slice(0, -1).join('.');
			const parentIndex = parentSection
				? headingPath.findLastIndex((label) => label.startsWith(`${parentSection} `))
				: -1;
			headingPath.length = parentIndex + 1;
			headingPath.push(structuralHeading.label);
			paraIndex++;
			continue;
		}

		blocks.push({
			text,
			headingPath: headingPath.length ? [...headingPath] : undefined,
			paraIndex,
			charStart: start,
			charEnd: start + part.length
		});
		paraIndex++;
	}

	return { blocks, pages: null };
}
