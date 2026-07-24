import { env } from '$env/dynamic/public';

/**
 * Assisted is the one mode that depends on this project's own backend (a
 * Cloudflare Worker with a Workers AI binding, auth and quotas). It is OFF by
 * default so the app is a purely client-side tool — Private (in-browser model)
 * and My AI (your own endpoint) need no server at all. The maintainer's hosted
 * deployment turns it on with `PUBLIC_ASSISTED_ENABLED=true`; a self-hosted
 * build without that variable simply never offers Assisted, and the
 * `/api/assisted` endpoint refuses.
 */
export const ASSISTED_ENABLED = env.PUBLIC_ASSISTED_ENABLED === 'true';
