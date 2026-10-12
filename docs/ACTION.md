# Register a production deployment

Ship It records a successful **public GitHub deployment** and returns a shareable rocket-launch link. It does not detect arbitrary provider deployments, certify their safety, or monitor uptime. Preview, staging, private, failed, cancelled, and in-progress deployments are unsupported.

## Release status

The official Worker is `https://ship-it-api.coform.workers.dev`. The real signed-OIDC smoke test passed production registration, replay idempotency, failed/staging rejection and nonblocking outage handling ([evidence](https://github.com/ndunl075/Ship-It/actions/runs/38209919539)). The examples pin the tested full commit `10b9f01ae16a6f73f193fb84000e9b430e1d8231`; SHA pinning is recommended even when a moving `v1` tag is available. Forks can deploy their own Worker using the setup guide.

The root `action.yml` uses [GitHub's Node 24 runtime](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runsusing-for-javascript-actions); adopters do not need to install Node or check out Ship It. Self-hosted runners must support Node 24 actions. The self-contained `packages/action/dist/index.js` is committed in the repository.

## Inputs and outputs

| Input           | Required | Meaning                                                                                                |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `deployment_id` | Yes      | Positive numeric ID of a real GitHub deployment in this repository                                     |
| `api_url`       | No       | Defaults to the official Worker; custom HTTPS origin must have no path, credentials, query or fragment |
| `environment`   | No       | Defaults to `production`; v1 supports exactly `production`                                             |

| Output       | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `registered` | `true` on success or duplicate; `false` on optional registration failure |
| `launch_id`  | Stable ID of the launch, empty on failure                                |
| `launch_url` | Public deep link, empty on failure                                       |

Ship It requests a short-lived GitHub OIDC token with audience `ship-it-api`; grant the calling **job** `id-token: write`. There is no Ship It API key, user PAT, or user account requirement. Tokens remain in memory and are never written to outputs, summaries, disk, or logs. The Worker independently checks provenance, public visibility, deployment SHA, successful status, production environment and recent-deploy window (24 hours by default).

## Deployment-status workflow

Use [examples/deployment-status.yml](../examples/deployment-status.yml) when your provider produces GitHub deployment status events. The job checks both successful status and production environment. The Action uses the deployment SHA from the event, which can differ from `github.sha`.

GitHub does not trigger most additional workflows for events produced with `GITHUB_TOKEN`. If your integration creates records with that token, use the final-step path instead.

## Final step in a deployment workflow

Use [examples/final-step.yml](../examples/final-step.yml) after your deployment provider confirms success **and** a successful status has been attached to a real GitHub deployment. Supply that deployment's ID from your existing deploy step. A provider URL, run ID or commit SHA is not a deployment ID. The example deliberately leaves the provider-specific deploy command as a prerequisite; never mark a failed deployment successful to get a rocket.

For this path the Action reads the deployment from the public GitHub REST API to obtain its actual SHA and environment. It never assumes `GITHUB_SHA` is the deployed commit. An unauthenticated lookup can hit GitHub rate limits; rerun later within the verification window. Users are not asked for a PAT.

## Reliability and troubleshooting

Ship It is an optional celebration. Registration errors produce actionable warnings and `registered=false` without failing the Action. Always keep `continue-on-error: true` on the calling step as an additional guard against runner/runtime errors. The Action never modifies a deployment status or rolls back a deploy. A failure to write the job summary after registration preserves `registered=true` and the launch outputs.

Each HTTP request has an eight-second deadline, including response-body reads. Network errors, timeouts, 429 and 5xx get at most three attempts, with exponential backoff plus jitter. Numeric and HTTP-date `Retry-After` headers are respected up to a five-second cap. Other 4xx responses and malformed success responses are not retried. Redirects are refused so authorization cannot follow an unexpected destination. Total work is bounded (up to three request groups for the final-step path).

- **Missing identity permission:** grant `id-token: write` on the job, not just another job in the workflow.
- **403/409:** confirm public repository, exact production environment, matching deployment ID/SHA, recent deployment and successful status.
- **404:** confirm this repository owns the deployment and it still exists.
- **429/5xx or unavailable:** rerun the workflow within the verification window. Replays return the same launch with `duplicate=true` and cannot create another launch record.
- **No GitHub deployment record:** configure your provider's GitHub Deployments integration, or create an honest deployment and status in your existing workflow. An arbitrary webhook or successful build is insufficient.

Raw server bodies and network exception strings are intentionally omitted from warnings, since they may contain credentials. HTTP status and controlled troubleshooting guidance are shown instead.

## Maintainer checks

Run `pnpm --filter @ship-it/action typecheck`, `pnpm --filter @ship-it/action test`, and `pnpm --filter @ship-it/action build`. Force-add the ignored distributable after rebuilding: `git add -f packages/action/dist/index.js`. CI must rebuild and compare it to prevent source/bundle drift.

Before publishing `v1`, test the bundle from a real public repository with the deployed Worker: register a successful production deployment, rerun and confirm the same ID, reject failed/staging records, and force a service outage while confirming the primary deployment still succeeds. Local mocks cover runner behavior but cannot establish live GitHub OIDC interoperability.
