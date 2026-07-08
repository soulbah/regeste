// Runtime-loaded assets that must stay out of the bundler.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
	const url: string;
	export default url;
}
