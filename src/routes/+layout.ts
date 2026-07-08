// Local-first app: everything meaningful happens client-side (OPFS, workers,
// WebGPU). SSR would leak module-level $state between users and can't run the
// pipeline anyway. API routes under /api are unaffected by this flag.
export const ssr = false;
