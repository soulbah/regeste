# State of the art review, August 2026

Nothing here has been run. It is a survey of what the field shipped since the
stack was chosen, ranked by the size of the gap it would close. Every claim
carries its source so it can be checked before anything is built on it.

Written after the owner's objection that the project stopped doing this and has
been living off decisions taken at init.

---

## 1. Document parsing — the largest measured gap, and it is ours

**What we run:** `@llamaindex/liteparse-wasm`, routed per page against our own
position-derived reading order.

**The number nobody had looked up:** liteparse scores **22.4% on olmOCR-bench**
(20.4% with OCR off) against Marker v2's 76.0%, MinerU's 72.7% and Docling's
50.3%. It is the fastest thing in the field by a wide margin — about 1,721
pages/second, roughly 73× Marker's CPU mode — and the weakest by an equally wide
margin. The stated reason is exact: it **has no layout model**, so it "collapses
on anything non-linear". ([benchmark
breakdown](https://www.marktechpost.com/2026/07/24/datalab-marker-v2-vs-mineru-docling-and-liteparse-benchmark-breakdown/))

**Who published it matters.** The comparison comes from Datalab, who make
Marker, so it is a vendor benchmarking its own product against rivals. Treat the
exact figures as advocacy. What survives that discount is the structural claim,
which is verifiable independently and is the part that concerns us: liteparse
ships **no layout model**. Nobody disputes that, including its own
documentation.

That sentence describes the last two weeks of work. Column gutters, priced-column
detection, modal-leading row grouping, the footer-glue repair: all of it is a
hand-written layout model, written because the parser has none.

**Why the leaders are not the answer:** Marker, MinerU and Docling are Python
and GPU-shaped. Nothing about them runs in a browser tab. The real field for
this product is much smaller.

### The challenger: a layout model that runs in the browser

[`ppu-doclayout`](https://github.com/PT-Perkasa-Pilar-Utama/ppu-doclayout) —
PP-DocLayoutV3 (130 MB) or V2 (213 MB) through `onnxruntime-web`, MIT, output in
reading order, and **25 region classes**: `table`, `header`, `footer`,
`footnote`, `paragraph_title`, `doc_title`, `seal`, `chart`, `formula`, and the
rest.

It is from **the same author as `ppu-paddle-ocr`**, which we already ship and
which was pushed yesterday (113 stars, 0 open issues, actively maintained). The
layout package itself is young: 10 stars, last pushed April 2026. Small, but the
vendor is alive and the integration idiom is one we already have in the codebase.

**Why this matters more than the parsing score.** A legal footer is currently
detected by `CORPORATE_BOILERPLATE`, a list of company-law nouns. A layout model
detects a footer because it _is at the bottom of the page, set apart, in the
footer band_. That is what a footer actually is. The same applies to `table`
versus `isPricedColumn`, and to `paragraph_title` versus our heading heuristics.
This is the one finding that attacks the word-list problem structurally rather
than by substitution — the direction spec 033 concluded it needed after the
prototype classifier lost its measurement.

Alternative, kept for the record: [DocLayout-YOLO](https://github.com/opendatalab/DocLayout-YOLO)
(2,242 stars, AGPL-3.0, so licence-compatible with us) is stronger on paper but
has not been pushed since April 2025 and has 55 open issues, and would need our
own ONNX export plus browser inference. More work, staler upstream.

### granite-docling-258M — rejected, then reinstated by measurement

First reading: English-only per its model card, so dead for a French product.
Second reading, after running it: **the model card is wrong about French** (the
owner's attestation comes back correct and fully tagged at fp32/q8) and the
"too slow" verdict was **our runtime's fault, not the model's**.

Measured on the same two French pages, same Mac:

| runtime                      | attestation | dense fee page |
| ---------------------------- | ----------- | -------------- |
| transformers.js ORT-WebGPU q8 | 20.0 s      | 123.6 s        |
| llama.cpp native (BF16 GGUF) | **6.4 s**   | **8.3 s**      |

Both native timings INCLUDE model load. Reported llama.cpp throughput for this
model is [~500 tok/s on a 4090](https://huggingface.co/ibm-granite/granite-docling-258M/discussions/16);
ORT-WebGPU here decodes at ~15 tok/s, which is where the "half an hour per
contract" came from. A 14-page contract at native speed is under two minutes of
background ingest.

The browser path exists in a runtime we already ship: **wllama v3 supports
multimodal** (`mmprojFile` in its HF loader, image input in chat completion),
and IBM publishes the [official GGUF + mmproj](https://huggingface.co/ibm-granite/granite-docling-258M-GGUF)
(332 MB + 190 MB). The wasm/WebGPU penalty against native Metal is the one
number still missing.

Two caveats that survive every runtime. Transcription slips at every precision
("sole de créditeur", "RECURS", "METROPOLIE") — so the VLM's output can carry
STRUCTURE and retrieval text, while citation text must keep coming from the
real text layer, the same hybrid contract the liteparse routing already uses.
And the ORT fp16/q4f16 exports emit garbage on WebGPU due to an upstream
overflow bug ([onnxruntime#26732](https://github.com/microsoft/onnxruntime/issues/26732),
[#26367](https://github.com/microsoft/onnxruntime/issues/26367)) — q8 is the
only correct ORT setting today.

Where this leaves the architecture: PP-DocLayout stays the cheap always-on
layer (0.9 s/page, 130 MB, no decoder to loop), and granite-docling through
wllama becomes the candidate for the pages a detector cannot settle — shaded
tables with no ruling, scans, and anything where list nesting matters.


---

## 2. OCR — we are one version behind, and there is now an official browser SDK

**What we run:** `ppu-paddle-ocr` on PP-OCRv5.

**PP-OCRv6 shipped 2026-06-11**: +4.6 points on text detection and +5.1 points
on recognition against PP-OCRv5_server, on a new PPLCNetV4 backbone, in three
tiers from 1.5M to 34.5M parameters, with ONNX weights on the Hub.
([announcement](https://huggingface.co/blog/PaddlePaddle/pp-ocrv6),
[paper](https://arxiv.org/html/2606.13108v1))

Two caveats to check before moving: v6's medium and small tiers cover 50
languages against v5's 106, and French is in the 46 Latin-script languages so it
is covered — but that needs confirming against the actual weights, not the blog
post. RapidOCR has [an open issue tracking v6
support](https://github.com/RapidAI/RapidOCR/issues/686), which suggests the
ecosystem is still catching up.

PaddleOCR also released **PaddleOCR.js**, an official browser inference SDK.
Ours is a third-party wrapper that works well; the official one is worth
comparing on the OCR A/B page we already built.

---

## 3. Retrieval technique — the cheapest measured win in the survey

**Contextual Retrieval** cuts retrieval failures by **49%**, and by **67%**
combined with reranking (failure rate 5.7% → 3.7% from contextual embeddings
alone). The mechanism is small: before embedding a chunk, prepend 50–100 tokens
of context explaining what the chunk is, generated from the whole document, and
index that for both the vector and the BM25 side.
([method](https://www.datacamp.com/tutorial/contextual-retrieval-anthropic))

For us the generator is local, so the cost is one short generation per chunk at
ingest — expensive once, free forever after, and entirely on device. It fits the
architecture without adding a dependency. **This is the highest
value-to-effort item in the whole survey.**

Complementary and cheaper still: [late
chunking](https://martilabs.substack.com/p/context-aware-retrieval-from-late)
embeds the whole document first and slices the token embeddings afterwards, so
chunk vectors keep document context with no extra generation at all. Gains grow
with document length. It needs a long-context embedder, which is worth checking
against EmbeddingGemma's window.

---

## 4. Embeddings — our choice holds up, the challenger costs licence and size

**What we run:** `embeddinggemma-300m` (WebGPU) / `multilingual-e5-small`
(wasm).

EmbeddingGemma-300M is still cited as a reference for its class, running under
200 MB quantized with Matryoshka truncation down to 128 dims. Nothing in the
survey says we chose wrong.

The one model clearly above it under 1B is
[`jina-embeddings-v5-text-small`](https://huggingface.co/jinaai/jina-embeddings-v5-text-small):
677M, 119+ languages, 32K context, #8 on MTEB Multilingual v2 and the best under
1B, ONNX weights published. Two costs: **2× the size**, and **CC BY-NC 4.0**.
The licence is no longer a hard block, but an open-source product whose weights
are non-commercial is an awkward thing to ask developers to adopt, which is
exactly the engouement the owner is aiming for. Worth measuring, not worth
assuming.

The e5 finding from spec 033 belongs here too: **e5 is an asymmetric retrieval
encoder and is the wrong geometry for comparing two questions.** If we ever want
query-to-query similarity, that needs a different model, not better prompts.

---

## 5. Reranking — the 544 MB is the problem, not the quality

**What we run:** `bge-reranker-v2-m3`, Apache 2.0, ~568M parameters, behind a
**544 MB consent prompt**. That download is why the reranker cannot be a
mandatory part of any pipeline, which in turn is why spec 033 could not use it
for grounding verification.

Challengers, both ~0.6B so no smaller on paper:

- [`jina-reranker-v3`](https://jina.ai/models/jina-reranker-v3/) — 0.6B,
  multilingual, a "last but not late interaction" architecture, beats the 1.5B
  mxbai-rerank-large with 2.5× fewer parameters, and is the strongest option
  under 200 ms.
- `Qwen3-Reranker-0.6B` — pointwise generative reranker, permissive licence.

The honest read: **the win here is quantization, not a new model.** 544 MB for
568M parameters means we are shipping something close to fp16. An int8 or q4
export would land near 150–250 MB and could make reranking default-on. That is a
packaging question we control, not a model search.

---

## 6. Vector store — we are on an alpha of a demo package

**What we run:** `sqlite-vec-wasm-demo@0.1.7-alpha.2`.

sqlite-vec itself is still described by its author as **a work in progress, not
ready for general usage**, with a beta "in the coming months". We are one step
further out than that: on a package whose name says `demo`.

Challengers for a browser:

- [**ferrovec**](https://singhpratech.github.io/ferrovec/) — Rust→WASM HNSW that
  **persists to OPFS and stays consistent across tabs**. The survey's own framing
  is that almost every browser vector library is in-memory and rebuilds on
  reload, and durability is the real differentiator. That is precisely our
  requirement. Young project, needs its own due diligence.
- **DuckDB-WASM + the `vss` extension** — HNSW indexes, OPFS persistence,
  installable on the WASM platform. Much heavier, but from a project with real
  institutional backing.
- [**Voy**](https://github.com/tantaraio/voy) — 75 KB gzipped, k-d tree, but
  in-memory and explicitly pre-1.0 with an unstable API. Not for us.

No urgency while it works, but "alpha of a demo" is not a foundation to build a
launch on, and the risk should be a known one rather than a discovered one.

---

## 7. Generation — worth a bake-off, not a switch

**What we run:** Qwen3.5 family through web-llm, Qwen3-0.6B GGUF through wllama
for the Lite tier.

[LFM2](https://www.liquid.ai/blog/liquid-foundation-models-v2-our-second-series-of-generative-ai-models)
is the interesting entrant: LFM2-1.2B is reported on par with Qwen3-1.7B while
being significantly smaller and faster, and LFM2.5-1.2B-Thinking sits in the same
~1 GB class as our Lite tier. Note that web-llm has [an open issue for Qwen3.5
support](https://github.com/mlc-ai/web-llm/issues/778) (Gated DeltaNet + MoE),
which is worth watching since it gates our own catalogue.

For French specifically the survey turned up a family we had never looked at:
CroissantLLM, Lucie-7B-Instruct, Gaperon, **Luth-LFM2-1.2B**. A French-tuned 1.2B
in the Lite tier's size class is exactly the kind of thing this review was
supposed to find.

One line worth repeating from the survey, because it is the whole thesis of this
document: for RAG, **retrieval quality matters more than model size** — a good
embedder plus clean chunking plus a smaller model beats a bigger model fed badly.

---

## What I would do, in order

1. **Contextual retrieval.** Biggest measured gain, no new dependency, fits the
   architecture. Gate it on the stress benchmark.
2. **A layout model in the browser** (`ppu-doclayout`). Closes the parsing gap
   the benchmark exposed AND removes document vocabularies structurally, which
   is what spec 033 concluded it needed. Same vendor as our OCR.
3. **Quantize the reranker.** A packaging change that could make reranking
   default-on and unblock everything that wanted a cross-encoder.
4. **PP-OCRv6.** Free accuracy on the path we already own, measurable on the A/B
   page that already exists.
5. **Re-check granite-docling every release** for French, and **watch sqlite-vec**
   toward its beta.

## What this review did not do

Run anything. Every number above is someone else's, and this codebase has twice
this month been saved by measuring a thing that sounded right and was not. Each
item needs its own A/B against our corpus before it goes near the product.
