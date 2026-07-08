// Shared between the embed worker and main-thread callers. Import-safe
// everywhere (the worker module itself calls expose() at top level and must
// only be loaded inside an actual Worker).

export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';

export interface EmbedProgress {
	phase: 'download' | 'embed';
	progress: number; // 0..1
}
