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
/** A social credential, read without asserting it exists.
 *
 * worker-configuration.d.ts only lists secrets it can see in .dev.vars, so typing
 * these on Env would either break the build until they are created or fight the
 * next `wrangler types`. One local shape, cast once, is honest about the fact
 * that they are optional at runtime — which is what a self-hosted build wants,
 * since a fork has no reason to hold the maintainer's OAuth apps.
 *
 * Both halves or neither. A client id without its secret is worse than no
 * provider at all: the button works, the redirect goes out, and the failure lands
 * on the provider's error page instead of ours. */
type SocialEnv = {
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
};

export type SocialProviderId = 'google' | 'github';

function creds(env: Env, provider: SocialProviderId) {
	const e = env as Env & SocialEnv;
	const clientId = provider === 'google' ? e.GOOGLE_CLIENT_ID : e.GITHUB_CLIENT_ID;
	const clientSecret = provider === 'google' ? e.GOOGLE_CLIENT_SECRET : e.GITHUB_CLIENT_SECRET;
	return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Which providers this deployment can actually offer. Read by /auth so a button
 * is disabled with its reason rather than leading somewhere broken. */
export function socialProvidersAvailable(env: Env): Record<SocialProviderId, boolean> {
	return { google: creds(env, 'google') !== null, github: creds(env, 'github') !== null };
}

export function createAuth(env: Env, origin: string, locale: 'fr' | 'en' = 'en') {
	const db = drizzle(env.DB, { schema });
	const google = creds(env, 'google');
	const github = creds(env, 'github');
	const dev = origin.includes('localhost') || origin.includes('127.0.0.1');
	return betterAuth({
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: origin,
		// Only the providers whose credentials are present, so better-auth never
		// advertises a route that fails at the redirect.
		//
		// The callback URL each provider must allow is derived, not chosen:
		// `${baseURL}/callback/${provider.id}` in better-auth's callback route, over
		// a baseURL of origin + basePath. So /api/auth/callback/google and
		// /api/auth/callback/github. Anything else fails with redirect_uri_mismatch.
		// Note the asymmetry when registering them: Google accepts a list of
		// redirect URIs on one client, a GitHub OAuth App accepts exactly one, so
		// testing GitHub locally needs a second OAuth App.
		socialProviders: {
			...(google ? { google } : {}),
			...(github ? { github } : {})
		},
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
