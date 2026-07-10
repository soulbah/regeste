import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';

// Bindings only exist per-request on Workers, so the auth instance is built
// per request in hooks.server.ts — never at module top level.
// baseURL comes from the request origin: better-auth's isAuthPath() rejects
// requests whose origin differs from baseURL, and the app runs on different
// origins in dev (vite :5173, wrangler :8787) and prod.
//
// Auth = email OTP only (owner decision, FEATURES 5ter). signIn.emailOtp
// auto-registers unknown emails, so one flow covers sign-up and sign-in.
export function createAuth(env: Env, origin: string) {
	const db = drizzle(env.DB, { schema });
	const dev = origin.includes('localhost') || origin.includes('127.0.0.1');
	return betterAuth({
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: origin,
		plugins: [
			emailOTP({
				async sendVerificationOTP({ email, otp }) {
					if (dev || env.OTP_DEBUG === '1') {
						// No email sending yet: the code lands in the server logs
						// (vite console locally, `wrangler tail` on a deploy).
						// Production wiring: Cloudflare Email Service — and this
						// branch must die before launch (docs/internal/OSS-LAUNCH.md).
						console.log(`[folio dev] OTP for ${email}: ${otp}`);
						return;
					}
					throw new Error('Email delivery not configured yet');
				}
			})
		],
		user: {
			// Spec 021 — account deletion from Settings; quota rows cascade.
			deleteUser: { enabled: true }
		},
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60
			}
		}
	});
}
