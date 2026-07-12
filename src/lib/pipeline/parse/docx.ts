// DOCX has no pages (flow format): position metadata is the heading breadcrumb
// plus a paragraph index, which the viewer uses to scroll to the cited block.

import type { ParsedDoc, ParsedBlock } from '$lib/types';

export async function parseDocx(data: ArrayBuffer): Promise<ParsedDoc> {
	const mammoth = await import('mammoth');
	const { value: html } = await mammoth.convertToHtml({ arrayBuffer: data });

	const dom = new DOMParser().parseFromString(html, 'text/html');
	const blocks: ParsedBlock[] = [];
	const headingPath: string[] = [];
	let paraIndex = 0;
	let offset = 0;

	for (const el of Array.from(dom.body.children)) {
		const tableRows =
			el.tagName === 'TABLE'
				? Array.from(el.querySelectorAll('tr'))
						.map((row) =>
							Array.from(row.querySelectorAll('th,td'))
								.map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
								.filter(Boolean)
								.join(' | ')
						)
						.filter(Boolean)
				: [];
		const text = tableRows.length ? tableRows.join('\n') : (el.textContent ?? '').trim();
		if (!text) continue;
		const level = /^H([1-6])$/.exec(el.tagName)?.[1];
		if (level) {
			headingPath.length = Number(level) - 1;
			headingPath.push(text);
			paraIndex++;
			offset += text.length + 1;
			continue;
		}
		blocks.push({
			text,
			headingPath: headingPath.length ? [...headingPath] : undefined,
			paraIndex,
			charStart: offset,
			charEnd: offset + text.length
		});
		paraIndex++;
		offset += text.length + 1;
	}

	return { blocks, pages: null };
}
