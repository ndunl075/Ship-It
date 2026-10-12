import {
  launchInputSchema,
  launchResultSchema,
  type LaunchInput,
  type LaunchResult,
} from '@ship-it/shared';

export interface Runtime {
  env: Record<string, string | undefined>;
  event: unknown;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  output: (name: string, value: string) => void;
  summary: (markdown: string) => void;
  warning: (message: string) => void;
}

export class ActionError extends Error {}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const positiveId = (value: unknown): number => {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^[1-9]\d*$/.test(value)))) {
    throw new ActionError('A positive numeric deployment/repository ID is required.');
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new ActionError('The deployment/repository ID is invalid.');
  return n;
};

export function apiOrigin(value: string | undefined): string {
  try {
    const u = new URL(value ?? '');
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== '/'
    )
      throw new Error();
    return u.origin;
  } catch {
    throw new ActionError(
      'Set api_url to your Ship It Worker HTTPS origin, without credentials, query, or a path.',
    );
  }
}

function retryDelay(response: Response | undefined, attempt: number, random: number): number {
  const header = response?.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    if (Number.isFinite(delay) && delay >= 0) return Math.min(delay, 5000);
  }
  return Math.min(5000, 500 * 2 ** attempt + Math.floor(random * 250));
}

// Every request, including response-body consumption, has an eight-second deadline.
// Never include response bodies, URLs, headers, or fetch exceptions in log messages.
export async function requestJson(
  runtime: Runtime,
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs = 8000,
): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let response: Response | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('timeout'));
        }, timeoutMs);
      });
      const result = await Promise.race([
        deadline,
        (async () => {
          response = await runtime.fetch(url, {
            ...init,
            signal: controller.signal,
            redirect: 'error',
          });
          if (!response.ok) {
            if (response.status === 429 || response.status >= 500) throw new Error('retry');
            throw new ActionError(
              `${label} rejected the request (HTTP ${response.status}). Check deployment success, production environment, public visibility, and id-token: write permissions.`,
            );
          }
          try {
            return await response.json();
          } catch {
            if (controller.signal.aborted) throw new Error('timeout');
            throw new ActionError(`${label} returned an invalid JSON response.`);
          }
        })(),
      ]);
      return result;
    } catch (error) {
      if (error instanceof ActionError) throw error;
      if (attempt === 2)
        throw new ActionError(
          `${label} is unavailable after three attempts. Rerun within the deployment verification window.`,
        );
    } finally {
      clearTimeout(timer);
    }
    await runtime.sleep(retryDelay(response, attempt, runtime.random()));
  }
  throw new ActionError('Request exhausted.');
}

export async function deploymentInput(runtime: Runtime): Promise<LaunchInput> {
  const { env } = runtime;
  const deploymentId = positiveId(env.INPUT_DEPLOYMENT_ID?.trim());
  const repositoryId = positiveId(env.GITHUB_REPOSITORY_ID);
  const event = object(runtime.event);
  const repository = object(event.repository);
  if (positiveId(repository.id) !== repositoryId || repository.private !== false) {
    throw new ActionError(
      'Ship It requires a public repository matching the workflow repository ID.',
    );
  }
  let deployment: Record<string, unknown>;
  if (env.GITHUB_EVENT_NAME === 'deployment_status') {
    deployment = object(event.deployment);
    if (
      positiveId(deployment.id) !== deploymentId ||
      object(event.deployment_status).state !== 'success'
    ) {
      throw new ActionError(
        'Only the successful deployment from this deployment_status event can launch.',
      );
    }
  } else {
    const repo = env.GITHUB_REPOSITORY ?? '';
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
      throw new ActionError('Missing GitHub workflow repository context.');
    // A final-step workflow SHA can differ from the deployment SHA. Read the actual record.
    deployment = object(
      await requestJson(
        runtime,
        `https://api.github.com/repos/${repo}/deployments/${deploymentId}`,
        {
          headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        },
        'GitHub deployment lookup',
      ),
    );
    if (positiveId(deployment.id) !== deploymentId)
      throw new ActionError('GitHub returned a different deployment ID.');
  }
  const environment = env.INPUT_ENVIRONMENT?.trim() || 'production';
  if (deployment.environment !== environment)
    throw new ActionError('The deployment environment does not match environment input.');
  const parsed = launchInputSchema.safeParse({
    schema_version: 1,
    repository_id: repositoryId,
    deployment_id: deploymentId,
    environment,
    commit_sha: deployment.sha,
  });
  if (!parsed.success)
    throw new ActionError(
      'Deployment must have a full commit SHA and a supported production environment.',
    );
  return parsed.data;
}

async function oidcToken(runtime: Runtime): Promise<string> {
  const endpoint = runtime.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const credential = runtime.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!endpoint || !credential)
    throw new ActionError(
      'Grant this job id-token: write to request a short-lived GitHub identity.',
    );
  let url: URL;
  try {
    url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
  } catch {
    throw new ActionError('GitHub supplied an invalid OIDC request endpoint.');
  }
  url.searchParams.set('audience', 'ship-it-api');
  const data = object(
    await requestJson(
      runtime,
      url.toString(),
      { headers: { Authorization: `Bearer ${credential}` } },
      'GitHub identity service',
    ),
  );
  if (typeof data.value !== 'string' || !data.value || /[\r\n]/.test(data.value))
    throw new ActionError('GitHub identity service did not return a token.');
  return data.value;
}

export async function register(runtime: Runtime): Promise<LaunchResult> {
  const origin = apiOrigin(runtime.env.INPUT_API_URL?.trim());
  const payload = await deploymentInput(runtime);
  const token = await oidcToken(runtime);
  const data = await requestJson(
    runtime,
    `${origin}/v1/launches`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Ship It API',
  );
  const parsed = launchResultSchema.safeParse(data);
  if (
    !parsed.success ||
    [parsed.data.launch_id, parsed.data.project_id, parsed.data.launch_url].some((value) =>
      /[\r\n]/.test(value),
    )
  ) {
    throw new ActionError('Ship It API returned an invalid launch response.');
  }
  return parsed.data;
}

const html = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

// Optional celebration failures never change the user's production deployment status.
export async function run(runtime: Runtime): Promise<void> {
  try {
    runtime.output('registered', 'false');
    runtime.output('launch_id', '');
    runtime.output('launch_url', '');
    const result = await register(runtime);
    runtime.output('launch_id', result.launch_id);
    runtime.output('launch_url', result.launch_url);
    runtime.output('registered', 'true');
    try {
      runtime.summary(
        `### Ship It 🚀\n\n${result.duplicate ? 'Already registered' : 'Launch registered'}: <a href="${html(result.launch_url)}">View your launch</a>\n\nVerified GitHub deployment success; this is not an uptime guarantee.\n`,
      );
    } catch {
      runtime.warning(
        'Launch registered, but the optional job summary could not be written. See the launch_url output.',
      );
    }
  } catch (error) {
    runtime.warning(
      error instanceof ActionError
        ? error.message
        : 'Optional Ship It celebration could not complete. Your production deployment is unaffected.',
    );
  }
}
