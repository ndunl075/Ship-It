# Ship It API v1

All bodies are JSON. Read endpoints require no authentication. In production, browser Origin must equal `PLANET_ORIGIN`; clients without Origin are supported. Write authentication is independent of CORS.

| Method | Path | Response |
| --- | --- | --- |
| GET | `/healthz` | `{ "ok": true }`, no DB read |
| GET | `/v1/world` | `{ projects, launches, nextCursor }` |
| GET | `/v1/projects` | `{ items: Project[], nextCursor }` |
| GET | `/v1/projects/:numeric_repository_id` | `Project` |
| GET | `/v1/projects/:numeric_repository_id/launches` | `{ items: Launch[], nextCursor }` |
| GET | `/v1/launches` | `{ items: Launch[], nextCursor }` |
| GET | `/v1/launches/:launch_id` | `{ launch, project }` |
| POST | `/v1/launches` | `{ launch_id, project_id, duplicate, launch_url }` |

Project and Launch contracts live in `packages/shared`. Hidden projects and all associated launches are excluded. Default limit is 30, or 100 for world; limits must be integers 1–100. World contains a project page plus the latest 30 launches. Project search uses `query` up to 100 characters and matches owner, repository, or display name. Cursors are opaque, bound to route/search, and ordered descending by timestamp plus ID. Pass `nextCursor` as `cursor` to fetch another page. New records can reorder project pages during pagination; keyset pagination avoids costly offsets.

Read responses have ETags and 30-second caching, including Worker edge caching when execution context is available. Conditional requests can return 304. Public information may remain cached for up to 30 seconds after moderation; purge the Worker cache for urgent takedowns. Errors and writes are never cached.

## Ingestion

Send `Authorization: Bearer <GitHub Actions OIDC token>` and `Content-Type: application/json`. Token audience is exactly `ship-it-api`. Body limit is 8 KiB, enforced while streaming even without Content-Length.

```json
{"schema_version":1,"repository_id":123456,"deployment_id":987654,"environment":"production","commit_sha":"0123456789abcdef0123456789abcdef01234567"}
```

Only this strict schema is accepted. Owner, description, names, and URLs come from GitHub. The signed token's numeric repository ID, public visibility, SHA, run ID, attempt, and event are checked against REST repository/deployment/run data. Supported event contexts: push, workflow_dispatch, deployment_status, workflow_run, release. Fork and pull-request contexts are excluded. The authenticated workflow SHA must equal the deployed SHA. The deployment must explicitly identify a production environment, its most recent status must be success, and that success must be within 24 hours (with at most one minute of future clock skew). A later failure/inactive status supersedes earlier success.

First registration returns 201. Repeats return 200 and `duplicate: true` with the original launch ID. Both project upsert and insert execute in a D1 atomic batch. A unique database constraint resolves concurrent duplicate requests. Duplicate requests still verify current identity and GitHub status; replay after 24 hours requires an explicit operator recovery process rather than bypassing verification.

Errors have `{ "error": { "code": "stable_code" }, "request_id": "..." }`. Statuses: 400 invalid payload/query/cursor, 401 invalid identity, 403 unsupported/mismatched identity/repository/environment or origin, 404 missing deployment/public resource, 409 unsuccessful/stale deployment, 413 oversized body, 429 rate limited (`Retry-After: 60`), 502 GitHub unavailable/invalid response, 503 storage or limiter unavailable. A 5xx never acknowledges a write as committed; safe retries are idempotent.

Worker native rate-limit bindings allow 30 ingestion attempts/IP/minute and 10/authenticated repository/minute. Cloudflare rate limits are local to a location and approximate, not billing protection or a global quota. Missing limiter bindings fail closed. No anonymous write or server-side demo endpoint exists.

## Local verification

Run `pnpm db:migrate:local`, `pnpm --filter @ship-it/api dev`, and `pnpm --filter @ship-it/api test`. Tests sign real RSA test JWTs through an injected local JWKS resolver, stub only GitHub HTTP, and execute the production SQL/migration against SQLite, including atomic rollback and concurrent duplicate requests. Production always uses GitHub's fixed JWKS URL; there is no configurable production test key or unsigned token mode.
