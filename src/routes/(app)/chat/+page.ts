// The empty chat shell is client-rendered (layout ssr=false), so its server
// output is a static script-tag list. Prerender it onto the asset store: the
// edge serves it in ~100 ms instead of paying a Worker cold start per visit.
export const prerender = true;
