// Server rendering is on by default, and off where it cannot work.
//
// This flag used to sit here as `ssr = false` for the whole site, which was right
// when / was the chat. It stopped being right the day the marketing site moved
// under (marketing): a crawler was served an 1844-byte shell with no title and no
// prose, so the landing was unindexable, and it shipped that way. The flag now
// lives with the routes that need it, src/routes/(app) and /auth, and everything
// else renders on the server.
//
// Prerendering the marketing group would be better still — static HTML at the
// edge, and no module state at all — but the Cloudflare adapter's build-time
// binding emulation dies on EPIPE before writing a single page, so that is a
// separate piece of work rather than a line of config.
export const ssr = true;
