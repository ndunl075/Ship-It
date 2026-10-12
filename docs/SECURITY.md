# Security and operations

Verification means GitHub reported a successful public production deployment. It establishes repository provenance, not service uptime, content safety, or security certification. A repository owner can create deployment records for their own repository. Links remain untrusted destinations; the frontend must render metadata as text and require an intentional click.

The Worker uses maintained `jose` RS256 signature verification with cached GitHub JWKS, fixed issuer and exact audience, required expiry/issued/not-before claims, and a ten-minute maximum token age. It validates structured immutable repository IDs rather than parsing `sub`. REST checks independently bind repository ID, SHA, workflow run/attempt/event, deployment environment and latest success freshness. Production must use HTTPS. Only HTTPS URLs without embedded credentials are published. Tokens, headers, raw bodies and GitHub error bodies are never logged; structured request IDs, response codes, latency buckets and stable error codes are logged.

Configure `DB`, `PLANET_ORIGIN` (origin only), `SITE_ORIGIN` (canonical site including `/Ship-It/`), `GITHUB_OIDC_AUDIENCE=ship-it-api`, and both native rate-limit bindings. `GITHUB_API_TOKEN` is optional maintainer-side read capacity; store using `wrangler secret put GITHUB_API_TOKEN`, never in source, frontend, adopter workflow, or `.dev.vars.example`. No adopter PAT is required. Real `.dev.vars` files must remain ignored.

## Maintainer procedures

`apps/api/wrangler.jsonc` identifies the maintainer-created free-tier D1 database; forks must create their own database and replace its ID. Run migrations locally first; back up production before migration and apply using `pnpm --filter @ship-it/api db:migrate:remote`. Deploy only from reviewed code. Do not enable paid upgrades automatically. Rate limits and cache TTLs reduce free-tier pressure but do not promise unlimited traffic.

The operator CLI is separate from the Worker; it uses the maintainer's Wrangler login. From `apps/api`:

```sh
node scripts/admin.mjs hide 123456 "Owner removal request #42" --remote
node scripts/admin.mjs unhide 123456 "Reviewed appeal #45" --remote
node scripts/admin.mjs reconcile 123456 "Scheduled public visibility review" --remote
```

Omit `--remote` for the local database. Every command records a moderation audit in the same SQL transaction. Reconcile fetches the repository by immutable ID, updates renamed metadata, and hides deleted/private repositories; it preserves deliberate hiding for repositories that remain public. GitHub outage/rate limiting aborts reconciliation without changes. Review all visible project IDs periodically. Hidden records remain stored for audit and do not automatically become visible when another deployment is ingested.

Removal/abuse requests use the repository's abuse/removal issue template; report vulnerabilities privately through GitHub's security reporting when enabled rather than publishing credentials or exploit tokens in issues. Hide urgent abusive records and purge edge cache; browser/API caches can otherwise retain public metadata for 30 seconds.

For GitHub quota exhaustion, return retryable 502, inspect non-secret request IDs, and wait for quota reset or configure a maintainer read-only credential. For D1/Worker outage, keep writes retryable and the frontend in its explicit unavailable/demo state. Registration failures never change a developer's deployment status. Users can rerun within the 24-hour freshness window. Recovery outside that window is an operator investigation: verify provenance, repository visibility, latest status and duplicate key before a separately reviewed database recovery; do not relax the public freshness window.

For rollback, restore the previous Worker version, revert the Pages deployment, and retain compatible migration history. Restore D1 using Cloudflare Time Travel/backups after checking which deployments would be lost; then reconcile affected repository/deployment IDs. Never log JWTs to diagnose auth. Rotate a leaked maintainer GitHub/Cloudflare credential and review audit/activity logs. There is no public administration HTTP route.

Reference implementations and policies: [GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc), [jose](https://github.com/panva/jose), [Cloudflare rate limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/).
