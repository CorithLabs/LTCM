# Security Policy

## Supported Versions

Security fixes are applied to the latest release on the `main` branch only.

| Version | Supported |
|---|---|
| Latest (`main`) | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Use GitHub's private vulnerability reporting instead — click the **"Report a vulnerability"** button on the [Security tab](https://github.com/CorithLabs/LTCM/security/advisories/new). Your report is visible only to the maintainers until a fix is released.

## What to Include

A good report helps us respond faster:

- Description of the vulnerability and its potential impact
- Steps to reproduce (or a proof-of-concept)
- Affected version / commit
- Any suggested fix if you have one

## What to Expect

| Stage | Timeline |
|---|---|
| Acknowledgement | Within 48 hours |
| Status update | Within 7 days |
| Patch (critical) | Within 14 days |
| Patch (moderate/low) | Best effort |

## Scope

**In scope:**
- Authentication or session bypass
- Unauthorised data access or privilege escalation
- SQL injection or other injection attacks
- Sensitive data exposure (credentials, tokens, PII)
- Broken access control (e.g. tester accessing admin endpoints)

**Out of scope:**
- Default credentials (`admin`/`admin`) — documented, users are forced to change on first login
- Vulnerabilities in third-party dependencies without a demonstrated exploit
- Issues requiring physical access to the server
- Denial of service against self-hosted instances

## Disclosure Policy

Once a fix is available, we will publish a GitHub Security Advisory crediting the reporter (unless they prefer to remain anonymous).
