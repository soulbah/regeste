// DOCX has no pages (flow format): position metadata is the heading breadcrumb
// plus a paragraph index, which the viewer uses to scroll to the cited block.

import type { ParsedDoc, ParsedBlock } from '$lib/types';

export function tableRowContext(headers: string[], cells: string[]): string {
	return cells
		.map((cell, index) =>
			cell && headers[index] && headers[index] !== cell ? `${headers[index]}: ${cell}` : cell
		)
		.filter(Boolean)
		.join(' | ');
}

export async function parseDocx(data: ArrayBuffer): Promise<ParsedDoc> {
	const mammoth = await import('mammoth');
	const { value: html } = await mammoth.convertToHtml({ arrayBuffer: data });

	const dom = new DOMParser().parseFromString(html, 'text/html');
	const blocks: ParsedBlock[] = [];
	const headingPath: string[] = [];
	let paraIndex = 0;
	let offset = 0;

	for (const el of Array.from(dom.body.children)) {
		if (el.tagName === 'TABLE') {
			const rows = Array.from(el.querySelectorAll('tr')).map((row) =>
				Array.from(row.querySelectorAll('th,td')).map((cell) =>
					(cell.textContent ?? '').replace(/\s+/g, ' ').trim()
				)
			);
			const headers = rows[0] ?? [];
			for (const cells of rows) {
				const text = cells.filter(Boolean).join(' | ');
				if (!text) continue;
				const retrievalContext = tableRowContext(headers, cells);
				blocks.push({
					text,
					retrievalContext,
					headingPath: headingPath.length ? [...headingPath] : undefined,
					paraIndex,
					charStart: offset,
					charEnd: offset + text.length
				});
				paraIndex++;
				offset += text.length + 1;
			}
			continue;
		}
		const text = (el.textContent ?? '').trim();
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
