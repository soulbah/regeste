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
		// Missing file or unsupported API (Safari write limitation at ingest time).
		return null;
	}
}
