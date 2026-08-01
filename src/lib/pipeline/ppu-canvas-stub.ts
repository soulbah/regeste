// Build-time stand-in for "ppu-ocv/canvas" (aliased in vite.config.ts).
//
// ppu-doclayout's base service dynamic-imports that module — the NODE canvas
// package wrapping a native binary — from a code path that only runs when
// `analyze` is handed raw bytes. Every caller in this app hands it a canvas
// (the worker renders pages itself), so the path is unreachable at runtime;
// without the alias, rolldown still tries to read skia's .node binary as JS
// and the production build dies.
export class CanvasProcessor {
	constructor() {
		throw new Error(
			'ppu-ocv/canvas is not available in the browser build: pass analyze() a canvas, never bytes'
		);
	}
}
export default { CanvasProcessor };
