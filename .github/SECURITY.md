# Security Policy

## Supported versions

Security fixes are provided for the latest release on `main`.

## Response targets

- Initial acknowledgment target: within 2 business days.
- Triage target (severity + impact + repro validity): within 5 business days.
- Remediation timeline: based on severity and exploitability.

## Reporting a vulnerability

Please do not open public issues for security vulnerabilities.

Report vulnerabilities by using GitHub Security Advisories (private reporting) for this repository, or contact the maintainers directly.

Include:

- Affected version/commit
- Reproduction steps
- Impact assessment
- Any known mitigations

We will acknowledge reports as quickly as possible and coordinate a fix and disclosure timeline.

## Triage and disclosure process

1. Confirm report validity and scope of impacted versions.
2. Classify severity and define mitigation/fix path.
3. Prepare patch and tests.
4. Coordinate disclosure timing with reporter.
5. Publish advisory and release notes once fix is available.

## False positives and suppression policy

- Security scan suppressions require a documented rationale in the pull request.
- Suppressions must be as narrow as possible and include an owner for follow-up.
- Periodic review should re-evaluate suppressions as dependencies and code evolve.
