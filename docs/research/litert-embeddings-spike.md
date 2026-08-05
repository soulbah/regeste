# LiteRT.js embeddings — GO/NO-GO (2026-07-17)

> The harness itself is not in the working tree: it was a throwaway plain-Vite
> project (`spike-litert/`) removed once the verdict was recorded. It is still
> in the history — `git show 1fb6756` — and the reproduction steps below are
> written against that checkout.

**Verdict: NO-GO.** LiteRT.js (`@litertjs/core` 2.5.3, released 2026-07-09) was evaluated as a
replacement for transformers.js on the embedding path (EmbeddingGemma WebGPU + E5 WASM fallback).
It lost every criterion, by a wide margin, on the only EmbeddingGemma `.tflite` published for it.

## Measured (M-series Mac, 12 cores, Chromium 149, crossOriginIsolated, 128 passages ~1100 chars FR/EN)

| Engine                                                       | Passages/s | 470 chunks | Query p50 | Load    |
| ------------------------------------------------------------ | ---------- | ---------- | --------- | ------- |
| transformers.js EmbeddingGemma q4 WebGPU (app)               | **34.1**   | ~14 s      | 26 ms     | 1.2 s\* |
| LiteRT.js EmbeddingGemma mixed-prec WebGPU                   | 4.7        | ~100 s     | 209 ms    | 2.1 s   |
| LiteRT.js same model, XNNPACK CPU (8 threads)                | 0.38       | ~21 min    | 2617 ms   | 0.3 s   |
| transformers.js multilingual-e5-small q8 WASM (app fallback) | 16.0       | ~29 s      | 7 ms      | 0.6 s\* |

\* warm cache (Cache API); cold adds the model download.

- GO criterion "≥2× ingestion on WebGPU": LiteRT is **7.2× slower**, not faster.
- GO criterion "CPU fallback clearly better than E5 WASM": LiteRT CPU is **42× slower** than E5.
- Vector drift vs the app's q4 ONNX embeddings (256-d truncated+renormalized, 140 texts):
  mean cosine 0.925, p5 0.904 — and only **55% top-5 retrieval overlap**. Adoption would force a
  full reindex (RETRIEVAL_VERSION bump) and a re-validation of the 117-case retrieval gate.

## Why it loses (root causes, not runtime bugs)

1. The only web-runnable EmbeddingGemma `.tflite` (litert-community, HF) is the **mixed-precision
   int4/int8 variant compiled for a fixed `[1, 512]` signature**: batch 1, every text padded to
   512 tokens. transformers.js batches 16 with dynamic padding (~300 tokens for our chunks).
2. Even per single inference the gap stands: 209 ms (LiteRT WebGPU) vs 26 ms (transformers.js
   WebGPU, single query) on the same 300M model — ML Drift gains don't materialize on this
   quant/shape; the variant targets mobile NPUs (`.tensor_g5` / `.sm8xxx` siblings).
3. XNNPACK multi-thread (threaded wasm build, 8 threads, SAB active) does not rescue the int4
   mixed-precision graph: 2.6 s per single embedding.

Bundle itself would have been fine (52 KB JS + one ~9 MB wasm, Apache-2.0, self-hostable) and the
runtime works exactly as documented — the blocker is model economics, not API quality.

## Reproduce

```bash
git worktree add /tmp/litert-spike 1fb6756   # the spike lived at spike-litert/
cd /tmp/litert-spike/spike-litert && bun install
# model (170.8 MB): official litert-community/embeddinggemma-300m is HF-gated (Gemma licence);
# spike used the ungated byte-identical filename mirror Arjuu/EmbeddingGemma.tflite:
curl -L -o models/embeddinggemma-300M_seq512_mixed-precision.tflite \
  "https://huggingface.co/Arjuu/EmbeddingGemma.tflite/resolve/main/embeddinggemma-300M_seq512_mixed-precision%20(1).tflite"
bun run dev                      # vite on :5199, COOP/COEP credentialless (as the app)
node scripts/spike-browser.mjs   # persistent benchmark Chromium (real WebGPU) on the page
node scripts/spike-run.mjs 128   # drives window.spikeRun over CDP, prints FINAL_RESULTS JSON
```

Harness notes: same prompt prefixes as the app (`task: search result | query:` /
`title: none | text:`), same tokenizer family (SentencePiece via the app's HF tokenizer), both
engines truncated to 256 dims + renormalized before comparison. Sources: the LiteRT.js launch
post (developers.googleblog.com), developers.google.com/edge/litert/web/get_started, the
`@litertjs/core` typings (threads/cpuOptions/Tensor), and litert-community/embeddinggemma-300m.

Revisit if Google publishes a batched or f32/dynamic-range web `.tflite` of EmbeddingGemma, or a
LiteRT.js batching API — the runtime load path and COEP fit were validated here and carry over.
