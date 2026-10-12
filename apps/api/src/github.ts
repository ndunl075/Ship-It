import { normalizeUrl, type LaunchInput } from '@ship-it/shared';
import type { Identity } from './auth';
import { ApiError } from './types';
type Repo = { id: number; private: boolean; visibility?: string; name: string; full_name: string; owner: { login: string }; description: string | null; homepage: string | null; html_url: string };
export type Verified = { repo: Repo; targetUrl: string | null; statusUrl: string; deployedAt: string };
export function githubClient(token?: string, fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {
 return async function get<T>(path: string): Promise<T> {
  let response: Response;
  try { response = await fetcher(`https://api.github.com${path}`, { headers: { Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'Ship-It', ...(token ? {Authorization:`Bearer ${token}`} : {}) }, signal: AbortSignal.timeout(7000), redirect:'error' }); }
  catch(error) {
   const name=error instanceof Error?error.name:'';
   const message=error instanceof Error?error.message:'';
   const failure = ['TimeoutError','AbortError'].includes(name) ? 'timeout'
    : /Illegal invocation|incorrect this/i.test(message) ? 'illegal_invocation'
    : /AbortSignal|timeout is not a function/i.test(message) ? 'unsupported_timeout'
    : /redirect/i.test(message) ? 'redirect'
    : /fetch failed/i.test(message) ? 'fetch_failed' : 'network';
   const errorName = name==='TypeError'||name==='Error'||name==='TimeoutError'||name==='AbortError'?name:'other';
   throw new ApiError(502,'github_unavailable',{upstream_path:path,upstream_failure:failure,upstream_error_name:errorName});
  }
  const rawRemaining=response.headers.get('X-RateLimit-Remaining');
  const remaining=rawRemaining!==null && /^\d+$/.test(rawRemaining)?Number(rawRemaining):undefined;
  const diagnostic={upstream_path:path,upstream_status:response.status,...(remaining!==undefined?{upstream_remaining:remaining}:{})};
  if (response.status === 404) throw new ApiError(404,'deployment_missing');
  if(response.status===429 || (response.status===403 && (remaining===0 || response.headers.has('Retry-After')))) throw new ApiError(502,'github_rate_limited',diagnostic);
  if(response.status===403) throw new ApiError(502,'github_forbidden',diagnostic);
  if (!response.ok) throw new ApiError(502,'github_unavailable',diagnostic);
  try { return await response.json() as T; } catch { throw new ApiError(502,'github_unavailable',{...diagnostic,upstream_failure:'invalid_json'}); }
 };
}
export async function verifyDeployment(input: LaunchInput, identity: Identity, get: ReturnType<typeof githubClient>, now = Date.now()): Promise<Verified> {
 if (identity.repositoryId !== input.repository_id || identity.sha !== input.commit_sha.toLowerCase()) throw new ApiError(403,'identity_mismatch');
 const repo = await get<Repo>(`/repositories/${input.repository_id}`);
 if (repo.id !== input.repository_id || repo.private || (repo.visibility && repo.visibility !== 'public') || repo.full_name.toLowerCase() !== identity.repository.toLowerCase()) throw new ApiError(403,'unsupported_repository');
 const base = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;
 const [deployment, run, statuses] = await Promise.all([
  get<{id:number;sha:string;environment:string;production_environment:boolean;repository_url:string}>(`${base}/deployments/${input.deployment_id}`),
  get<{id:number;run_attempt:number;event:string;head_sha:string;repository:{id:number};head_repository:{id:number}}>(`${base}/actions/runs/${identity.runId}`),
  get<{state:string;created_at:string;environment_url:string;url:string}[]>(`${base}/deployments/${input.deployment_id}/statuses?per_page=100`)
 ]);
 if (run.id !== identity.runId || run.run_attempt !== identity.runAttempt || run.event !== identity.event || run.repository.id !== input.repository_id || run.head_repository?.id !== input.repository_id || run.head_sha?.toLowerCase() !== identity.sha) throw new ApiError(403,'run_mismatch');
 if (deployment.id !== input.deployment_id || deployment.sha?.toLowerCase() !== identity.sha || deployment.repository_url !== `https://api.github.com/repos/${repo.full_name}`) throw new ApiError(403,'deployment_mismatch');
 if (deployment.environment !== input.environment || input.environment !== 'production' || deployment.production_environment !== true) throw new ApiError(403,'unsupported_environment');
 // GitHub returns newest first. A later failure/inactive status supersedes success.
 const latest = statuses[0];
 const age = now - Date.parse(latest?.created_at ?? '');
 if (!latest || latest.state !== 'success' || !Number.isFinite(age) || age < -60000 || age > 86400000) throw new ApiError(409,'deployment_not_successful');
 const statusUrl = normalizeUrl(latest.url);
 if (!statusUrl || !statusUrl.startsWith(`https://api.github.com/repos/${repo.full_name}/deployments/${input.deployment_id}/statuses/`)) throw new ApiError(502,'github_invalid_response');
 return { repo, targetUrl: normalizeUrl(latest.environment_url) ?? normalizeUrl(repo.homepage), statusUrl, deployedAt: new Date(latest.created_at).toISOString() };
}
