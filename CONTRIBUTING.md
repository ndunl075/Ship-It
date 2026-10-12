# Contributing

Read ARCHITECTURE.md and docs/SECURITY.md first. Node 22 and pnpm 10.28.2 are the development toolchain. Run `pnpm install`, `pnpm db:migrate:local`, `pnpm dev`. Demo data stays in the browser; never add an unauthenticated ingestion route.

Before opening a focused PR run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`. Database changes need a new forward-compatible migration and local migration check. Action changes must regenerate the committed bundle. Never commit `.dev.vars`, OAuth credentials, OIDC tokens, or personal data.

Use readable HTML controls alongside the 3D scene and honor reduced motion. Preserve deterministic landing sites and the one-launch-per-deployment uniqueness constraint.
