# Setup

## Local, no cloud account

Install Node 22 and pnpm 10.28.2 (`corepack enable`). Run `pnpm install --frozen-lockfile`. Copy `apps/web/.env.example` to `.env.local` in the same directory and enable `VITE_DEMO_MODE=true`. Run `pnpm dev`; open the Vite URL with `/Ship-It/`. The clearly labeled simulation runs entirely in your browser and never submits fake launches.

To exercise local persistence, run `pnpm db:migrate:local`. Wrangler uses a local SQLite database. Local ingestion still requires a real signed GitHub Actions OIDC identity; tests supply isolated signed tokens and stub GitHub responses instead of weakening the deployed verifier.

## Free Cloudflare backend

1. Create or use a Cloudflare account on Workers Free. Do not select a paid subscription.
2. In `apps/api`, run `pnpm exec wrangler login`, then `pnpm exec wrangler d1 create ship-it`.
3. Copy the returned database UUID into `apps/api/wrangler.jsonc` (`d1_databases[0].database_id`). This identifier is public configuration, not a credential.
4. Set `PLANET_ORIGIN` to the site origin only (`https://ndunl075.github.io`) and `SITE_ORIGIN` to the full site base (`https://ndunl075.github.io/Ship-It/`). Keep audience `ship-it-api`.
5. Run `pnpm exec wrangler d1 migrations apply ship-it --remote`, then `pnpm exec wrangler deploy`.
6. Check `/healthz` and `/v1/world` at the printed `https://...workers.dev` URL. Never put Cloudflare credentials into the browser or adopter Action.

The optional maintainer `GITHUB_API_TOKEN` increases GitHub REST headroom. Set it with `wrangler secret put GITHUB_API_TOKEN` only when needed; public-repository adopters never provide a personal access token. Unauthenticated GitHub REST quotas make retries important at low traffic too.

## GitHub Pages

Set Settings → Pages → Source to **GitHub Actions**. Add repository Actions variable `VITE_API_ORIGIN` with the Worker origin (no trailing path). The Publish planet workflow runs after successful main CI; it builds for `/Ship-It/` and publishes the site. Query-parameter launch/project links work without a server rewrite. For a fork, update Vite base, site origin, CORS origin, repository links, and Pages URL consistently.

## Add the Action to an adopter repository

Read [ACTION.md](ACTION.md). Use a full tested commit SHA until the `v1` release gate has passed. Copy the deployment-status example when the provider creates GitHub Deployments. Otherwise invoke the Action as the last step after the provider confirms success, passing a real deployment ID. Keep `id-token: write`, `contents: read`, `environment: production`, and `continue-on-error: true` on the optional celebration step.

Ship It supports public repositories and GitHub deployment records with a recent successful production status. A successful record establishes GitHub provenance; it does not prove continuous uptime, safety, or independent provider verification. Preview, staging, private repositories and arbitrary webhook JSON are unsupported.

## Verify the real release

Run the maintainer live smoke workflow only after the Worker is deployed. It creates a real public production deployment record, reports its success, invokes the bundled Action, repeats registration to prove idempotency, and verifies rejected staging/failed records. Review the public REST record and launch URL. Do not publish the major Action tag until this passes. See [OPERATIONS.md](OPERATIONS.md) for incidents and rollback.
