# Implementation ledger

Source of truth: ../ARCHITECTURE.md. Each accepted feature receives a separate pull request and merge.

- [x] Foundation and shared validation/geometry — PR #1
- [x] Verified Worker API, persistence, moderation and security tests — PR #3
- [x] Public GitHub Action and integration tests — PR #2
- [x] Astra planet UI, animation, accessible explorer and demo — PR #5
- [x] Real OIDC smoke workflow and runtime redirect hardening — PRs #4, #6
- [x] CI, Pages publication workflow, operator/setup/security documentation
- [x] Hosted Pages browser acceptance against the deployed Worker
- [x] Versioned Action release — [v1.0.0](https://github.com/ndunl075/Ship-It/releases/tag/v1.0.0), with moving `v1` tag

## Evidence

The deployed API is https://ship-it-api.coform.workers.dev, backed by the maintainer-created `ship-it` D1 database. The initial remote migration completed. No billing plan was upgraded; no paid service or token is required in adopter repositories.

[Real GitHub OIDC acceptance (successful attempt 5)](https://github.com/ndunl075/Ship-It/actions/runs/38209919539/attempts/5) passed on October 12, 2026. It created a successful public production deployment, registered it with a GitHub-signed short-lived identity, returned the same launch ID on replay, rejected a failed deployment and staging attempt, and kept the primary workflow successful during a forced API outage. A subsequent successful deployment created a second launch at the same saved project coordinates. A later retry hit GitHub's unauthenticated REST API quota; attempt 5 remains the successful acceptance run.

Local validation passes 70 tests (30 API, 26 Action, 12 frontend, 2 shared), strict TypeScript, ESLint, formatting, workflow/example YAML parsing, builds, and local D1 migrations. Three browser tests cover desktop exploration/sharing/setup, 320px mobile/reduced motion/deep links, and WebGL failure. Opt-in production browser tests also cover the real API arrival and simulated outage/empty states.

Measured build sizes: approximately 92 KiB gzip initial JS and 253 KiB gzip lazy 3D chunk. Default real world payload is under 2 KiB with the initial project and two launches; public result counts are bounded. These are measurements of the release candidate, not unlimited scalability or device-performance guarantees.

The hosted browser test passed against https://ndunl075.github.io/Ship-It/ and the production Worker on October 12, 2026. It loaded a persisted verified launch, followed it through approach, celebration and arrival, checked the project link, then verified the sandbox and its exit. The same run confirmed useful outage and empty-world states. Captured proof is in [real-launch.png](assets/real-launch.png) and [real-launch.webm](assets/real-launch.webm).

The public [v1.0.0 release](https://github.com/ndunl075/Ship-It/releases/tag/v1.0.0) and moving `v1` tag point to the tested Action. The immutable release commit is `e6963c77e51f859ff94b8ec1c2e80b2c93a50a3a`. The real public GitHub OIDC acceptance and hosted browser tests passed before publication.
