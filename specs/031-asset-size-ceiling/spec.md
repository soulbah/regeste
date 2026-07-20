# 031 — Asset size ceiling and build-asset skew

Status: **not started**. Guarded, not fixed. Trigger and decision recorded below so
the work can start calmly instead of under a blocked deploy.

## The constraint

Cloudflare Workers refuses any static asset over **25 MiB = 26,214,400 bytes**, on
Workers Free and Workers Paid alike
([platform limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets)).
It is a per-file limit, not a total. It is deliberate, not an oversight: when
Cloudflare raised the file _count_ 5x in Sept 2025 (20,000 → 100,000) they stated
the individual file size was unchanged, and their docs point at R2 for anything
larger.

## Where we stand (measured 2026-07-20)

| asset                                    | on disk      | % of limit | headroom  |
| ---------------------------------------- | ------------ | ---------- | --------- |
| `ort-wasm-simd-threaded.jsep-*.wasm`     | 26,101,073 B | **99.57%** | 113,327 B |
| `ort-wasm-simd-threaded.asyncify-*.wasm` | 23,567,050 B | 89.90%     | 2.52 MiB  |

Only these two are anywhere near. The limit applies to the **stored** file; over
the wire both are brotli-compressed to ~5.4 MB and ~5.1 MB, so the number the
user downloads is a fifth of the number Cloudflare measures.

### Why the file is that big

Embeddings run on device, which means shipping a whole inference runtime. ONNX
Runtime Web publishes four wasm builds; we emit the two largest because they are
the ones giving WebGPU and its fallback:

| variant         | size    | role                                   |
| --------------- | ------- | -------------------------------------- |
| `simd-threaded` | 12.3 MB | CPU only                               |
| `jspi`          | 13.9 MB | modern stack switching                 |
| `asyncify`      | 22.5 MB | same, instrumented (doubles code size) |
| `jsep`          | 24.9 MB | CPU **+ WebGPU** — the one at 99.57%   |

No smaller WebGPU-capable variant exists. Dropping to the 12.3 MB build means
giving up WebGPU for embeddings.

### Why it is our file at all

`@huggingface/transformers` references the wasm with
`new URL(..., import.meta.url)`, so Vite treats it as an asset of our build and it
ships inside our Worker. A file fetched from a third-party CDN would not count
against this limit, but cross-origin isolation (COOP/COEP, required for
`SharedArrayBuffer`) makes naive third-party fetches fail — which is exactly why
`src/routes/cdn/[...path]/+server.ts` already exists for model weights.

## Risk shape

Not an outage risk. `@huggingface/transformers@4.2.0` pins `onnxruntime-web` to an
**exact** version (`1.26.0-dev.20260416-b7804b056c`, no caret), so a plain
`bun install` cannot drift. The size can only move when we deliberately bump
transformers.js — and `scripts/check-asset-limits.mjs` fails `bun run build`
before `wrangler deploy` ever sees it.

So the real failure mode is **a dependency upgrade that becomes unshippable**, not
a broken deployment. That is what makes this schedulable rather than urgent.

## Options

**A — R2 mirror, served same-origin through a binding.** Cloudflare's own answer
to the limit. Bind an R2 bucket, serve large build assets from our own origin, so
COEP is satisfied and the service worker can still cache them (a _public_ r2.dev
bucket would be a different origin and would reintroduce the COEP problem).
Solves the ceiling **and** the build-asset skew gap in one move: old hashes stay
served after a deploy, so a returning client never 404s.

Cost, corrected: earlier analysis claimed 62 MB per deploy. That is wrong for a
content-addressed sync. Vite filenames _are_ content hashes — verified across four
builds and three deploys on 2026-07-20, `jsep-CCdEhX4k.wasm` kept the same name
while `nodes/1.js` changed hash three times. So the mirror uploads ~62 MB once,
then only genuinely changed files. A code-only deploy uploads a couple of MB.
Remaining cost is a GC job for builds old enough that no client can still want
them.

**B — Route the ONNX wasm through the existing `/cdn` proxy.** Cheaper to write,
but the service worker deliberately bails out on `/cdn/*`
(`src/service-worker.ts`), so the wasm would leave our offline cache — and offline
is a demonstrated product promise. It also converts a build-time guarantee into a
runtime dependency on an upstream host, and risks ABI drift between the bundled JS
glue and a wasm URL we construct by hand. Rejected unless A proves impractical.

**C — Give up WebGPU for embeddings** and ship the 12.3 MB build. Large headroom,
noticeably slower embeddings. Not recommended.

## Decision

Guard now (done), option A when the guard escalates from warning to error, or when
the open-source launch makes the skew gap worth closing anyway — whichever comes
first. Before either, pin `@huggingface/transformers` to an exact version so the
bump is a deliberate act with a known cost.

## Done when

- `bun run build` fails on any asset over 26,214,400 bytes, and warns within 10%.
  **(done — `scripts/check-asset-limits.mjs`, wired into the `build` script)**
- Large build assets are served from our own origin without counting against the
  per-asset limit, and remain service-worker cacheable.
- Assets from the previous N deploys stay fetchable, so a client on an older build
  does not 404.
