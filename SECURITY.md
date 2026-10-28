# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately through GitHub instead:
[**Report a vulnerability**](https://github.com/rinkitadhana/openside/security/advisories/new)

Include what you can of:

- what the issue is and what an attacker could do with it
- steps to reproduce it (requests, payloads, screenshots)
- the affected part (web app, API, recording pipeline, self-hosting)

You'll get a reply within a few days. Once it's fixed we're happy to credit you
in the advisory, unless you'd rather stay anonymous.

## Scope

In scope: this repository's code - the web app (`web/`) and the API and media
workers (`core/`), including self-hosted deployments of them.

Out of scope: denial of service through sheer traffic volume, social
engineering, and issues in third-party services (LiveKit, Clerk, Cloudflare R2)
that aren't caused by how Openside uses them.
