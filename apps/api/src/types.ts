export interface Statement {
 bind(...args: unknown[]): Statement;
 first<T>(): Promise<T | null>;
 all<T>(): Promise<{ results: T[] }>;
 run(): Promise<{ success: boolean }>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export interface Limiter { limit(options: { key: string }): Promise<{ success: boolean }> }
export interface Env {
 DB: Database; PLANET_ORIGIN: string; SITE_ORIGIN: string; GITHUB_OIDC_AUDIENCE: string;
 GITHUB_API_TOKEN?: string; IP_LIMITER: Limiter; REPO_LIMITER: Limiter;
}
export class ApiError extends Error {
 constructor(public status: number, public code: string, public diagnostic?: { upstream_path: string; upstream_status?: number; upstream_remaining?: number; upstream_failure?: 'timeout'|'network'|'invalid_json'|'illegal_invocation'|'unsupported_timeout'|'redirect'|'fetch_failed'; upstream_error_name?: 'TypeError'|'Error'|'TimeoutError'|'AbortError'|'other' }) { super(code); }
}
