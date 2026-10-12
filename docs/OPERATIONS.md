# Operations

## Free services only

Use Cloudflare Workers Free and D1 Free, and public-repository GitHub Pages/Actions. Never enable a paid tier automatically. Recheck provider quotas before launch; availability is bounded by those quotas. Static assets stay on Pages, public reads are cached, and clients pause polling in hidden tabs. Expect at most one feed refresh per minute per active visitor; cached reads protect D1 but still consume Worker requests. Monitor request and row counts in Cloudflare and disable ingestion or lengthen cache TTL before daily limits are exhausted.

## Outage

Check `/healthz`, Cloudflare Worker logs and D1 health. Correlate errors using `request_id`; never log Authorization. GitHub verification 502 errors may be quota exhaustion or GitHub outage. The adopter's deployment must remain successful even when Ship It registration fails. Retry the adopter workflow within 24 hours after recovery. If the window has expired, investigate manually; do not weaken the public verification window.

## Moderation and privacy

Review repository Issues tagged as removal/abuse requests. Verify the requesting owner through GitHub repository permissions or a public repo statement. Hide/unhide through the maintainer CLI documented in SECURITY.md, recording the reason in `moderation_audit`. Hidden projects and all their launches must disappear from every public read route. Edge-cache TTL means removal can take up to the configured cache duration. Purge deployed caches for urgent takedowns. Run metadata reconciliation periodically; hide deleted/private repositories and update renamed metadata.

## Rollback and restore

Use GitHub Pages deployment history to restore a previous site. Use `wrangler rollback` to restore the Worker version. Back up/export D1 before schema changes and use Cloudflare D1 Time Travel when available on the account. Restore into a separate database, verify counts/uniqueness and hidden records, then switch the binding; never overwrite a live DB without a reviewed backup. Prefer forward-compatible migrations so application rollback remains safe.

## Release gate

Do not create `v1` until a real public production deployment has passed OIDC ingestion, replay returns the same launch ID, staging/failed cases are rejected, and an API outage cannot fail the primary deployment. Keep evidence in docs/IMPLEMENTATION.md. Publish an immutable release plus moving major tag only after these checks, and recommend full-SHA Action pins.
