import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import { sendOtpEmail } from './otp-email';

// Bindings only exist per-request on Workers, so the auth instance is built
// per request in hooks.server.ts — never at module top level.
// baseURL comes from the request origin: better-auth's isAuthPath() rejects
// requests whose origin differs from baseURL, and the app runs on different
// origins in dev (vite :5173, wrangler :8787) and prod.
//
// Auth = email OTP only (owner decision, FEATURES 5ter). signIn.emailOtp
// auto-registers unknown emails, so one flow covers sign-up and sign-in.
export function createAuth(env: Env, origin: string, locale: 'fr' | 'en' = 'en') {
	const db = drizzle(env.DB, { schema });
	const dev = origin.includes('localhost') || origin.includes('127.0.0.1');
	return betterAuth({
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: origin,
		plugins: [
			emailOTP({
				async sendVerificationOTP({ email, otp }) {
					// Local dev has no EMAIL binding, so the code goes to the console
					// the developer is already watching. A deploy always sends: a
					// silent fallback there would let a broken sender look healthy.
					if (!env.EMAIL) {
						if (dev) {
							console.log(`[dev] sign-in code for ${email}: ${otp}`);
							return;
						}
						throw new Error('EMAIL binding missing: cannot send the sign-in code');
					}
					await sendOtpEmail(env.EMAIL, email, otp, locale);
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
