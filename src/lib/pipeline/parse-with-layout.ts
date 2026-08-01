// Ingest's parse entry: parseByName with the layout detector wired (spec 034).
//
// Its own module because it marries two halves that must not know each other:
// `parse/` is pure text extraction usable in node and tests, and the detector
// lives in the OCR worker because rasterisation cannot run on a hidden main
// thread. The detector opens the document in that worker on the FIRST uncertain
// page (most documents never pay it) and is always disposed before OCR, which
// reopens the document for itself.

import { parseByName, isPdf } from './parse';
import { createLayoutDetector } from './ocr';
import type { ParsedDoc } from '$lib/types';

export async function parseWithLayout(
	name: string,
	mime: string,
	data: ArrayBuffer
): Promise<ParsedDoc> {
	if (!isPdf(name, mime)) return parseByName(name, mime, data);
	const layout = createLayoutDetector(data);
	try {
		return await parseByName(name, mime, data, { detectLayout: layout.detect });
	} finally {
		await layout.dispose();
	}
}
