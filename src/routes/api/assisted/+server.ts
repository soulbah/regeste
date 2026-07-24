// The Assisted endpoint: the ONLY place user content transits our server.
// Privacy invariants (constitution §1-2):
// - excerpts and question are used for this single AI call and never stored
// - no content in logs — counts and durations only
//
// Non-streaming for now: streamed bodies don't survive vite dev's binding
// proxy, and GLM-flash answers grounded questions in a few seconds. Revisit
// SSE at first real deploy (it works natively on workerd).

import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import { drizzle } from 'drizzle-orm/d1';
import { checkAndIncrementQuota } from '$lib/server/quota';
import { buildAssistedUserContent } from '$lib/server/assisted-prompt';
import { ASSISTED_ENABLED } from '$lib/flags';
import type { RequestHandler } from './$types';

// glm-4.7-flash verified 2026-07-09: correct grounded answers but ~2 min per
// call (reasoning queue; reasoning_effort/enable_thinking had no effect via
// the binding). llama-3.3-70b fp8 fast: same quality on grounded FR QA, seconds.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const BodySchema = v.object({
	question: v.pipe(v.string(), v.minLength(1), v.maxLength(4000)),
	context: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(2000))),
	excerpts: v.pipe(
		v.array(
			v.object({
				text: v.pipe(v.string(), v.minLength(1), v.maxLength(8000)),
				label: v.pipe(v.string(), v.maxLength(300))
			})
		),
		v.maxLength(12)
	)
});

const SYSTEM = `You are a careful assistant answering questions strictly from the numbered document excerpts provided.
Rules:
- Answer in the language of the question.
- For a name, number, date, or amount, answer in one short natural sentence unless clarification is necessary.
- Preserve full names as written. Do not invent aliases or split a full name.
- Use ONLY the excerpts. If they do not contain enough information, say you couldn't find enough information in the documents (in the question's language) and nothing else.
- Cite every factual statement with the excerpt number in square brackets, e.g. [1] or [2][3].
- The bracketed numbers labeling each excerpt are reference labels added when assembling the excerpts. They are not part of any document: never report them as numbers, identifiers or values from the documents.
- Conversation context resolves references only. It is not evidence and must not be cited.
- Be concise. Answer directly without reasoning preamble.`;

interface ChatCompletion {
	choices?: Array<{ message?: { content?: string } }>;
	response?: string;
}

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	// Assisted is off unless this deployment enabled it. A self-hosted build
	// without PUBLIC_ASSISTED_ENABLED never offers the mode in the UI, and the
	// endpoint refuses so it can't be driven directly either.
	if (!ASSISTED_ENABLED) throw error(404, 'Not found');

	const session = await locals.auth.api.getSession({ headers: request.headers });
	if (!session) throw error(401, 'Sign in to use Assisted mode');

	const parsed = v.safeParse(BodySchema, await request.json().catch(() => null));
	if (!parsed.success) throw error(400, 'Invalid request');
	const { question, excerpts, context } = parsed.output;

	const env = platform!.env;
	// Local dev runs without the AI binding (wrangler.dev.jsonc) — honest 503.
	if (!env.AI) throw error(503, 'Assisted is not available in local dev — test against a deploy');
	const db = drizzle(env.DB);
	const quota = await checkAndIncrementQuota(db, session.user.id);
	if (!quota.allowed) throw error(429, 'Monthly Assisted quota reached');

	const userContent = buildAssistedUserContent(question, excerpts, context);

	const t0 = Date.now();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result = (await env.AI.run(MODEL as any, {
		messages: [
			{ role: 'system', content: SYSTEM },
			{ role: 'user', content: userContent }
		],
		max_tokens: 800
	})) as ChatCompletion;

	const answer = result.choices?.[0]?.message?.content ?? result.response ?? '';

	// Content-free observability.
	console.log(
		`[assisted] user=${session.user.id.slice(0, 8)} excerpts=${excerpts.length} quota=${quota.used}/${quota.limit} duration=${Date.now() - t0}ms answerChars=${answer.length}`
	);

	return json({ answer, quota: { used: quota.used, limit: quota.limit } });
};
