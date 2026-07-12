// On-device OCR model (spec 023). PP-OCRv5 latin (Apache-2.0), served
// same-origin so no third party ever learns a document is being read. The ~12 MB
// weights are fetched into static/models/ocr at install time (not committed —
// see scripts/vendor-ocr-models.sh) and browser-cached. Only the generic
// onnxruntime-web wasm glue is fetched from a CDN (never document bytes).
export const OCR_MODEL = {
	detection: '/models/ocr/PP-OCRv5_mobile_det_infer.onnx',
	recognition: '/models/ocr/latin_PP-OCRv5_mobile_rec_infer.onnx',
	charactersDictionary: '/models/ocr/ppocrv5_latin_dict.txt'
} as const;
