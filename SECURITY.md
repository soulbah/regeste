# Security

Regeste is a privacy-first product: documents, chats, embeddings and indexes
never leave the user's device. The only server component is a Cloudflare
Worker that handles authentication, quotas and the assisted answer mode
(which receives excerpts transiently and never persists or logs them). Treat
any path that breaks those invariants as a critical vulnerability.

## Reporting a vulnerability

Please report security issues privately to the maintainer instead of opening
a public issue:

- GitHub: use the repository's private vulnerability reporting form
  (Security -> Report a vulnerability).
- Email: contact the maintainer at the address listed on the GitHub profile.

Include, when possible: the affected version, a minimal reproduction, and
whether the issue touches the privacy invariants above. You will receive an
acknowledgement within 3 business days and a status update as the issue is
triaged.

## Scope

In scope: the SvelteKit app, the Cloudflare Worker (`src/routes/api/**`,
`src/lib/server/**`), the in-browser pipeline (`src/lib/pipeline/**`,
`src/lib/private-ai/**`), and the build/deploy workflows.

Out of scope: third-party packages (report upstream), the on-device model
weights, and known limitations documented in the specs.

## Security expectations

- All API endpoints validate input with valibot before use.
- Secrets live in Cloudflare (`wrangler secret put`); nothing is committed.
- CI workflows run with the least privilege and pinned action versions.
