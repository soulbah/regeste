import { defineConfig } from 'vite';

// Mirrors the app's cross-origin isolation (vite.config.ts of the main app):
// XNNPACK multi-threading and transformers.js WASM threads both need
// SharedArrayBuffer, which needs COOP/COEP.
export default defineConfig({
	server: {
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'credentialless'
		}
	},
	optimizeDeps: {
		exclude: ['@huggingface/transformers', '@litertjs/core']
	}
});
