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
	label: string;
	expiry: string;
	ignore: string;
	sender: string;
}

// Both languages, chosen from the request rather than guessed: someone reading
// the app in French should not get an English email.
const COPY: Record<'fr' | 'en', OtpCopy> = {
	fr: {
		subject: 'Votre code de connexion',
		line: 'Saisissez ce code pour vous connecter.',
		label: 'Code de connexion',
		expiry: `Valable ${VALID_MINUTES} minutes.`,
		ignore: "Si vous n'avez rien demandé, ignorez ce message.",
		sender: 'Envoyé par mail.regeste.com. Ce message ne contient aucun lien.'
	},
	en: {
		subject: 'Your sign-in code',
		line: 'Enter this code to sign in.',
		label: 'Sign-in code',
		expiry: `Valid for ${VALID_MINUTES} minutes.`,
		ignore: 'If you did not ask for it, ignore this message.',
		sender: 'Sent by mail.regeste.com. This message contains no links.'
	}
};

/** The Accept-Language header, reduced to a locale this app writes copy in. */
export function pickLocale(header: string | null): 'fr' | 'en' {
	return header?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function html(code: string, copy: OtpCopy): string {
	// The identity, carried by type rather than by an image.
	//
	// No images at all: they are blocked by default in most clients, a remote one
	// is a tracking pixel whether or not it is meant as one, and this product does
	// not get to make an exception for its own mail. So the wordmark is text — the
	// bracket that opens it everywhere else, in the accent green — set in a serif
	// stack, because a webfont cannot be relied on and Georgia is the closest
	// thing to Newsreader that every client already has.
	//
	// One table, for centring. The earlier version was proud of being table-free,
	// which is backwards: Outlook's Word engine ignores max-width on a div, so a
	// table is the only layout that holds up. It is one cell, not a grid.
	//
	// And no links, stated in the footer. A sign-in message with nothing to click
	// is the one shape phishing cannot imitate usefully, and saying so teaches the
	// reader what to distrust next time.
	const serif = "Newsreader,Georgia,'Times New Roman',serif";
	const mono = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
	const sans = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif';
	return `<!doctype html>
<html lang="${copy === COPY.fr ? 'fr' : 'en'}"><head><meta charset="utf-8" />
<meta name="color-scheme" content="light" /><meta name="supported-color-schemes" content="light" />
</head>
<body style="margin:0;padding:0;background:#f5f3ef;color:#1c1a17;font-family:${sans}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ef">
<tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:420px">
<tr><td style="padding:0 0 30px">
<span style="font-family:${serif};font-size:22px;letter-spacing:-0.01em"><span style="color:#3f7357">[</span>Regeste</span>
</td></tr>
<tr><td style="padding:0 0 22px;font-size:15px;line-height:1.6">${copy.line}</td></tr>
<tr><td style="padding:0 0 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffefb;border:1px solid #e3dfd7;border-radius:12px">
<tr><td align="center" style="padding:22px 16px 20px">
<div style="font-family:${mono};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6b6660;padding-bottom:12px">${copy.label}</div>
<div style="font-family:${mono};font-size:34px;letter-spacing:0.24em;font-weight:600;line-height:1;text-indent:0.24em">${code}</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 0 30px;font-size:13px;line-height:1.6;color:#6b6660">${copy.expiry} ${copy.ignore}</td></tr>
<tr><td style="border-top:1px solid #e3dfd7;padding:16px 0 0;font-family:${mono};font-size:11px;line-height:1.6;color:#8a8580">${copy.sender}</td></tr>
</table>
</td></tr></table>
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
		text: `${copy.line}\n\n${copy.label}: ${code}\n\n${copy.expiry} ${copy.ignore}\n\n${copy.sender}\n`,
		html: html(code, copy)
	});
}
