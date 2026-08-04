# Third-party notices

Regeste is AGPL-3.0-only, but some components ship under their own licenses.
This file lists the assets distributed with the repo or loaded at runtime, and
the license obligations that come with them.

## Vendored binaries (in-repo)

These files are copied into the repository and shipped as-is:

| Asset                                                    | Origin                                      | License           |
| -------------------------------------------------------- | ------------------------------------------- | ----------------- |
| `static/vendor/sqlite/sqlite3.mjs` + `.wasm`             | sqlite-vec-wasm-demo 0.1.7-alpha.2 (pinned) | MIT OR Apache-2.0 |
| `static/models/ocr/PP-OCRv5_mobile_det_infer.onnx`       | PaddleOCR PP-OCRv5 (det)                    | Apache-2.0        |
| `static/models/ocr/latin_PP-OCRv5_mobile_rec_infer.onnx` | PaddleOCR PP-OCRv5 (rec, latin)             | Apache-2.0        |
| `static/models/ocr/ppocrv5_latin_dict.txt`               | PaddleOCR latin character dictionary        | Apache-2.0        |

### Apache-2.0 notice (PaddleOCR models)

```
Copyright 2026 PaddlePaddle Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### SQLite

`sqlite3.mjs` and `sqlite3.wasm` come from the SQLite project via
`sqlite-vec-wasm-demo` (MIT OR Apache-2.0). SQLite itself is in the public
domain; the WASM build carries the MIT/Apache dual license of its distribution
package.

## Runtime dependencies (via npm)

The npm dependencies are licensed by their respective authors; the exact set
with versions lives in `package.json` and `bun.lock`. Notable ones:

| Package                    | License      |
| -------------------------- | ------------ |
| @huggingface/transformers  | Apache-2.0   |
| @mlc-ai/web-llm            | Apache-2.0   |
| @wllama/wllama             | MIT          |
| onnxruntime-web            | MIT          |
| @llamaindex/liteparse-wasm | Apache-2.0   |
| pdfjs-dist                 | Apache-2.0   |
| mammoth                    | BSD-2-Clause |
| ppu-doclayout              | MIT          |
| ppu-paddle-ocr             | MIT          |
| comlink                    | Apache-2.0   |
| drizzle-orm                | Apache-2.0   |
| better-auth                | MIT          |
| valibot                    | MIT          |
| fflate                     | MIT          |

Model weights downloaded at runtime (embeddings, WebLLM GGUFs) are distributed
by their upstream projects under their own licenses (Apache-2.0 or permissive);
the download consent card in the app links to the model being fetched.
