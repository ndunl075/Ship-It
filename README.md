# Ship It

A successful deployment becomes a rocket launch on one shared planet.

Implementation follows [ARCHITECTURE.md](ARCHITECTURE.md). Public GitHub production deployments are verified by a Cloudflare Worker; visitors explore a static React globe hosted on GitHub Pages. No paid AI API or mandatory paid service.

## Development

Use Node 22 and pnpm 10.28.2. Run `pnpm install`, `pnpm db:migrate:local`, then `pnpm dev`. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before a pull request.

The Action and official API are under development. No release tag or hosted API is implied by these instructions.
