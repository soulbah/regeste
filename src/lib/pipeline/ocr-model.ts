// On-device OCR model (spec 023). PP-OCRv5 latin (Apache-2.0), self-hosted
// same-origin so no third party ever learns a document is being read. ~12 MB
// (det 4.5 + latin rec 7.7 + dict), served as static app assets and
// browser-cached. Only the generic onnxruntime-web wasm glue is fetched from a
// CDN (never document bytes); self-hosting it waits on a Vite dev fix.
export const OCR_MODEL = {
	detection: '/models/ocr/PP-OCRv5_mobile_det_infer.onnx',
	recognition: '/models/ocr/latin_PP-OCRv5_mobile_rec_infer.onnx',
	charactersDictionary: '/models/ocr/ppocrv5_latin_dict.txt'
} as const;
