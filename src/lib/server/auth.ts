import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';

// Bindings only exist per-request on Workers, so the auth instance is built
// per request in hooks.server.ts — never at module top level.
// baseURL comes from the request origin: better-auth's isAuthPath() rejects
// requests whose origin differs from baseURL, and the app runs on different
// origins in dev (vite :5173, wrangler :8787) and prod.
export function createAuth(env: Env, origin: string) {
	const db = drizzle(env.DB, { schema });
	return betterAuth({
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: origin,
		emailAndPassword: {
			enabled: true
		},
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60
			}
		}
	});
}
