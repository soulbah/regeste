import { env } from '$env/dynamic/public';

/**
 * Cloudflare Web Analytics site token (not a secret: it ships in the page, in
 * the beacon's data attribute). The beacon counts anonymous, cookieless page
 * views and only the public marketing pages load it, and only when a token is
 * configured. The app shell never includes it, so document content, chats,
 * answers and filenames never reach any analytics service.
 *
 * The hosted deployment sets PUBLIC_CF_WEB_ANALYTICS_TOKEN; a self-hosted
 * build without it ships no beacon at all.
 */
export const WEB_ANALYTICS_TOKEN = env.PUBLIC_CF_WEB_ANALYTICS_TOKEN ?? '';
