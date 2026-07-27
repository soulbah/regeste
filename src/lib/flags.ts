import { env } from '$env/dynamic/public';

/**
 * Cloud is the one mode that depends on this project's own backend (a
 * Cloudflare Worker with a Workers AI binding, auth and quotas). It is OFF by
 * default so the app is a purely client-side tool: This device (in-browser
 * model) and Your server (your own endpoint) need no server of ours at all.
 * The maintainer's hosted deployment turns it on with
 * `PUBLIC_ASSISTED_ENABLED=true`; a self-hosted build without that variable
 * simply never offers it, and the `/api/assisted` endpoint refuses.
 *
 * `bun run dev` sets it so local work sees the three modes a hosted user sees.
 * Note this is a process variable, not a wrangler `vars` entry: the client
 * reads it through `$env/dynamic/public`, which is served from the dev
 * process's own environment.
 */
export const ASSISTED_ENABLED = env.PUBLIC_ASSISTED_ENABLED === 'true';
