# Security policy

Folio's core promise is that user documents never leave the device. Anything that undermines that promise is a critical vulnerability.

## Reporting

Report vulnerabilities privately via GitHub Security Advisories ("Report a vulnerability" on the repo's Security tab). Do not open public issues for security problems.

We aim to acknowledge within 72 hours.

## Scope of highest concern

- Any path by which document content, chat content, embeddings or filenames reach the server, logs or third parties outside the explicit Assisted excerpt flow
- Authentication/session flaws in the better-auth integration
- XSS in rendered document or chat content (documents are untrusted input)
