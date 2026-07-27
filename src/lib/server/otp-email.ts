// The sign-in code, sent through Cloudflare Email Service.
//
// First-party rather than Resend or Postmark, which is what the constitution's
// Cloudflare-first rule asks for: one less vendor holding a list of this
// product's users, and the sending domain's DKIM, SPF and DMARC records are
// managed in the same zone.
//
// Nothing about a user's documents or questions can appear here. The only
// personal datum is the address the code is going to, which the user typed a
// second ago.

// A subdomain of its own, and a local part that names the category.
//
// Not the root domain: transactional mail and anything the brand ever sends to
// a list have to keep separate reputations, or a campaign that collects
// complaints drags sign-in codes into the spam folder with it. Google sends
// account mail from accounts.google.com for the same reason.
//
// Not `noreply@` either. It is common for one-time codes, and it costs
// deliverability signals and strands anyone who replies for help.
const FROM = 'login@mail.regeste.com';

/** How long a code stays valid, kept in sync with the plugin's default. */
const VALID_MINUTES = 5;

interface OtpCopy {
	subject: string;
	line: string;
	expiry: string;
	ignore: string;
}

// Both languages, chosen from the request rather than guessed: someone reading
// the app in French should not get an English email.
const COPY: Record<'fr' | 'en', OtpCopy> = {
	fr: {
		subject: 'Votre code de connexion',
		line: 'Voici votre code de connexion.',
		expiry: `Il est valable ${VALID_MINUTES} minutes.`,
		ignore: "Si vous n'avez rien demandé, ignorez ce message."
	},
	en: {
		subject: 'Your sign-in code',
		line: 'Here is your sign-in code.',
		expiry: `It is valid for ${VALID_MINUTES} minutes.`,
		ignore: 'If you did not ask for it, ignore this message.'
	}
};

/** The Accept-Language header, reduced to a locale this app writes copy in. */
export function pickLocale(header: string | null): 'fr' | 'en' {
	return header?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function html(code: string, copy: OtpCopy): string {
	// Deliberately plain: table-free, image-free, one accent. Anything richer
	// renders badly across clients and reads like marketing, and this is a
	// message someone opens for four seconds to copy six digits.
	return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#faf8f4;font-family:ui-sans-serif,system-ui,sans-serif;color:#1c1a17">
<p style="margin:0 0 20px;font-size:15px">${copy.line}</p>
<p style="margin:0 0 20px;font-family:ui-monospace,monospace;font-size:32px;letter-spacing:6px;font-weight:600">${code}</p>
<p style="margin:0 0 6px;font-size:13px;color:#6b6660">${copy.expiry}</p>
<p style="margin:0;font-size:13px;color:#6b6660">${copy.ignore}</p>
</body></html>`;
}

/**
 * Send one sign-in code. Throws on failure so the endpoint can answer honestly
 * rather than telling someone to check an inbox nothing was sent to.
 */
export async function sendOtpEmail(
	sender: SendEmail,
	to: string,
	code: string,
	locale: 'fr' | 'en'
): Promise<void> {
	const copy = COPY[locale];
	await sender.send({
		from: FROM,
		to,
		subject: copy.subject,
		text: `${copy.line}\n\n${code}\n\n${copy.expiry}\n${copy.ignore}\n`,
		html: html(code, copy)
	});
}
