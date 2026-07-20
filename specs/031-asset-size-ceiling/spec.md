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

## Deferred: the one worker death that stays silent

`guardWorker` listens for `error` on the Worker object. Measured in Chromium
against the deployed origin, that covers four of the five ways a worker dies:

| mode                             | `error` event |
| -------------------------------- | ------------- |
| throws at top level              | fires         |
| imports a missing module         | fires         |
| syntax error                     | fires         |
| throws asynchronously after load | fires         |
| **loads, then stops answering**  | **silent**    |

Every mode a redeploy or a broken build produces is in the covered set. What is
left is a worker killed under memory pressure, a deadlock, or a swallowed
rejection.

A handshake ping does **not** close it. At handshake time the worker has just
loaded and answers; the ping only detects "the script ran but comlink never
worked", which `error` already reports, sooner and unambiguously. Catching a
_later_ death needs a per-call deadline, and this codebase has no safe deadline
to pick: OCR runs at 300 DPI per page, a generation takes ~60 s, an ingest longer
still. Any deadline sized for those is useless, and any useful one fires on a
slow first boot.

The only sound design is a watchdog on **absence of progress**, not on elapsed
time: alarm when the signal stops, not when the work is long. Three workers
already emit exactly that signal — `EmbedProgress`, `OcrProgress`, and the
generation deltas — so a watchdog would wrap those and leave the database worker
alone, whose calls are short anyway.

Not built. It touches every hot path in the app to catch three rare causes, and
nobody has hit one. Revisit if a tester reports an unexplained freeze that
`guardWorker` did not catch.

## Decision

Sequenced 2026-07-20, cheapest and most user-visible first.

1. **Pin the dependency. (done)** `@huggingface/transformers` moved from `^4.2.0`
   to `4.2.0`, so the only way this file can grow is a bump we choose to make.
2. **Make a failed worker visible. (done)** Independent of this ceiling and of
   skew — see below. It is what turns the worst outcome into a recoverable one.
3. **Option A, the R2 mirror. (not started)** At the open-source launch, or when
   the build guard escalates from warning to error, whichever comes first. It is
   the only item that removes both problems structurally rather than making them
   survivable, and its cost is now known to be modest: one ~62 MB sync, then only
   genuinely changed files.

### Why 2 came before 3

Before it, a worker script that failed to load was unobservable. Nothing listened
for `error` at any of the six construction sites (verified), the worker still
constructs, and comlink then waits on a reply that never arrives — no rejection,
no timeout. The page sat on its skeletons forever with nothing to explain it.
Skew is only one way to reach that state; a network hiccup during a lazy load
reaches it too, with no deploy involved. `guardWorker` in
`src/lib/state/worker-health.svelte.ts` now observes it and the layout surfaces
one honest message with a reload action. Verified live both ways: forcing a 404
on the database worker produces the message, and a normal boot stays silent.

That bounds the damage without touching infrastructure. It does not make the 404
stop happening — only step 3 does that.

## Done when

- `bun run build` fails on any asset over 26,214,400 bytes, and warns within 10%.
  **(done — `scripts/check-asset-limits.mjs`, wired into the `build` script)**
- Large build assets are served from our own origin without counting against the
  per-asset limit, and remain service-worker cacheable.
- Assets from the previous N deploys stay fetchable, so a client on an older build
  does not 404.
