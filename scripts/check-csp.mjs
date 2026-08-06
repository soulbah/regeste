import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Every executable inline script in the built output must be allowed by that page's
// own policy, and this fails the build when one is not.
//
// It exists because of a real near-miss. The content policy allow-lists SvelteKit's
// bootstrap script by hash, and SvelteKit only hashes what it generates itself:
// mode-watcher injects its own inline script to apply the stored theme before the
// first paint, and that one was refused. Nothing crashes when it is — the page just
// renders in the wrong theme for a moment, which is exactly the kind of defect that
// ships and lives for months.
//
// A hardcoded hash in the config would fix this instance and break silently the next
// time that dependency is upgraded. Checking the built HTML fixes the class: any
// inline script anyone adds, from us or from a package, has to be accounted for
// before the build passes.
const ROOTS = ['.svelte-kit/output/prerendered/pages', '.svelte-kit/cloudflare'];

/** Types the browser will execute. A JSON-LD block is data and never runs. */
const EXECUTABLE = new Set(['', 'module', 'text/javascript', 'application/javascript']);

const sha256 = (source) => `sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}`;

async function htmlFiles(dir, out = []) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			// _app holds hashed build assets, never documents.
			if (entry.name !== '_app') await htmlFiles(path, out);
		} else if (entry.name.endsWith('.html')) {
			out.push(path);
		}
	}
	return out;
}

const problems = [];
let scanned = 0;
let checked = 0;

for (const root of ROOTS) {
	for (const file of await htmlFiles(root)) {
		const html = await readFile(file, 'utf8');
		// The attribute value has to be matched by its own quote character: a policy is
		// full of single quotes ('self', 'none'), so a character class excluding both
		// quote kinds stops at the first one and reads almost nothing. That mistake
		// makes this check pass everything, which is worse than not having it.
		const policy =
			html.match(/<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"/i)?.[1] ??
			html.match(/<meta\s+http-equiv='content-security-policy'\s+content='([^']*)'/i)?.[1];
		if (!policy) continue;
		scanned++;
		const allowed = new Set(policy.match(/sha256-[A-Za-z0-9+/=]+/g) ?? []);
		const permissive = /script-src[^;]*'unsafe-inline'/.test(policy);
		// A document the worker renders carries a nonce instead of hashes. A script
		// bearing that nonce is allowed, and only a script without it needs a hash.
		const nonces = new Set((policy.match(/'nonce-([^']+)'/g) ?? []).map((m) => m.slice(7, -1)));
		// `</script >` is a valid end tag — HTML allows whitespace before the
		// closing bracket. Demanding `</script>` exactly would end the match at
		// the NEXT end tag, so an inline script closed that way would be hashed
		// with the wrong body, and this check would pass a script the browser
		// refuses to run.
		for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
			if (/\ssrc=/i.test(attrs)) continue;
			const type = (attrs.match(/type=["']([^"']*)["']/i)?.[1] ?? '').toLowerCase();
			if (!EXECUTABLE.has(type)) continue;
			checked++;
			const nonce = attrs.match(/nonce=["']([^"']+)["']/i)?.[1];
			if (nonce && nonces.has(nonce)) continue;
			const hash = sha256(body);
			if (!permissive && !allowed.has(hash)) {
				problems.push({ file, hash, head: body.trim().slice(0, 70).replace(/\s+/g, ' ') });
			}
		}
	}
}

if (problems.length > 0) {
	console.error(`\n✘ ${problems.length} inline script(s) the content policy will refuse:\n`);
	const seen = new Set();
	for (const p of problems) {
		if (seen.has(p.hash)) continue;
		seen.add(p.hash);
		console.error(`  ${p.hash}`);
		console.error(`    first seen in ${p.file}`);
		console.error(`    starts: ${p.head}\n`);
	}
	console.error(
		"Add the hash to csp.directives['script-src'] in vite.config.ts, or serve the\n" +
			"script from a file so 'self' covers it.\n"
	);
	process.exit(1);
}

console.log(
	`  content policy: ${checked} inline script(s) across ${scanned} document(s), all allow-listed`
);
