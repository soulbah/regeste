#!/usr/bin/env bash
# Fetch the on-device OCR weights (PP-OCRv5 latin, Apache-2.0) into
# static/models/ocr. Kept out of git — large binaries, re-fetched at install.
# Source mirror: github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models.
# Non-fatal: an offline install just leaves OCR unavailable until re-run.
set -uo pipefail

DIR="static/models/ocr"
BASE="https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main"
RAW="https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main"

mkdir -p "$DIR"
fetch() { # url, filename
	[ -s "$DIR/$2" ] && return 0
	curl -fsSL "$1" -o "$DIR/$2" && echo "  fetched $2" || echo "  SKIPPED $2 (offline?)"
}
fetch "$BASE/detection/PP-OCRv5_mobile_det_infer.onnx" "PP-OCRv5_mobile_det_infer.onnx"
fetch "$BASE/recognition/multi/latin/v5/latin_PP-OCRv5_mobile_rec_infer.onnx" "latin_PP-OCRv5_mobile_rec_infer.onnx"
fetch "$RAW/recognition/multi/latin/v5/ppocrv5_latin_dict.txt" "ppocrv5_latin_dict.txt"
