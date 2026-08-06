// OPFS access to original files, keyed by content hash. Mirrors storeOriginal
// in the ingest flow; the viewer reads from here — never from the network.

export async function readOriginal(hash: string): Promise<ArrayBuffer | null> {
	try {
		const root = await navigator.storage.getDirectory();
		const dir = await root.getDirectoryHandle('documents');
		const fh = await dir.getFileHandle(hash);
		const file = await fh.getFile();
		return await file.arrayBuffer();
	} catch {
		// Missing entry, or a storage API that refused the write at ingest time.
		// Callers must treat null as "the source copy is gone", not as a parse
		// failure: the indexed document itself is untouched and still answers.
		return null;
	}
}
