import {
  landingCoordinates,
  normalizeUrl,
  type Project,
  type Launch,
  type Page,
  type LaunchInput,
} from '@ship-it/shared';
import type { Verified } from './github';
import { ApiError, type Database } from './types';
type Row = Record<string, string | number | null>;
const projects = `SELECT p.*, (SELECT count(*) FROM launches WHERE project_id=p.id) AS launch_count FROM projects p`;
function project(r: Row): Project {
  return {
    id: String(r.id),
    githubRepositoryId: Number(r.github_repository_id),
    owner: String(r.github_owner),
    repository: String(r.github_repo),
    name: String(r.display_name),
    description: r.description as string | null,
    repoUrl: String(r.repo_url),
    homepageUrl: r.homepage_url as string | null,
    latitude: Number(r.position_lat),
    longitude: Number(r.position_lon),
    latestLaunchedAt: String(r.latest_launched_at),
    launchCount: Number(r.launch_count),
  };
}
function launch(r: Row): Launch {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    commitSha: String(r.commit_sha),
    environment: 'production',
    targetUrl: r.target_url as string | null,
    deployedAt: String(r.deployed_at),
    recordedAt: String(r.recorded_at),
    verifiedBy: 'github-deployment-status',
  };
}
export type Cursor = { time: string; id: string; scope: string };
export function decodeCursor(value: string | null, scope: string): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 1024) throw 0;
    const c = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/'))) as Cursor;
    if (
      c.scope !== scope ||
      !/^\d{4}-\d\d-\d\dT/.test(c.time) ||
      !Number.isFinite(Date.parse(c.time)) ||
      typeof c.id !== 'string' ||
      c.id.length > 100
    )
      throw 0;
    return c;
  } catch {
    throw new ApiError(400, 'invalid_cursor');
  }
}
function encodeCursor(c: Cursor): string {
  return btoa(JSON.stringify(c)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
export class Store {
  constructor(private db: Database) {}
  async ingest(input: LaunchInput, v: Verified, runId: number, now: string) {
    const id = crypto.randomUUID(),
      pid = `gh:${input.repository_id}`;
    const point = landingCoordinates(input.repository_id);
    const text = (s: string | null, max: number) =>
      s
        ?.split('')
        .filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
        .join('')
        .slice(0, max) ?? null;
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO projects(id,github_repository_id,github_owner,github_repo,display_name,description,repo_url,homepage_url,first_launched_at,latest_launched_at,position_lat,position_lon,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(github_repository_id) DO UPDATE SET github_owner=excluded.github_owner,github_repo=excluded.github_repo,display_name=excluded.display_name,description=excluded.description,repo_url=excluded.repo_url,homepage_url=CASE WHEN excluded.latest_launched_at >= projects.latest_launched_at THEN excluded.homepage_url ELSE projects.homepage_url END,first_launched_at=min(projects.first_launched_at,excluded.first_launched_at),latest_launched_at=max(projects.latest_launched_at,excluded.latest_launched_at),updated_at=excluded.updated_at`,
        )
        .bind(
          pid,
          input.repository_id,
          v.repo.owner.login,
          v.repo.name,
          text(v.repo.name, 100),
          text(v.repo.description, 500),
          normalizeUrl(v.repo.html_url),
          normalizeUrl(v.targetUrl) ?? normalizeUrl(v.repo.homepage),
          v.deployedAt,
          v.deployedAt,
          point.latitude,
          point.longitude,
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO launches(id,project_id,github_deployment_id,github_run_id,commit_sha,environment,target_url,status_url,deployed_at,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,github_deployment_id) DO NOTHING`,
        )
        .bind(
          id,
          pid,
          input.deployment_id,
          runId,
          input.commit_sha.toLowerCase(),
          input.environment,
          v.targetUrl,
          v.statusUrl,
          v.deployedAt,
          now,
        ),
    ]);
    const row = await this.db
      .prepare('SELECT id FROM launches WHERE project_id=? AND github_deployment_id=?')
      .bind(pid, input.deployment_id)
      .first<{ id: string }>();
    if (!row) throw new ApiError(503, 'storage_unavailable');
    return { launch_id: row.id, project_id: pid, duplicate: row.id !== id };
  }
  async project(repoId: number): Promise<Project | null> {
    const row = await this.db
      .prepare(`${projects} WHERE p.github_repository_id=? AND p.status='visible'`)
      .bind(repoId)
      .first<Row>();
    return row ? project(row) : null;
  }
  async detail(id: string) {
    const row = await this.db
      .prepare(
        `SELECT l.* FROM launches l JOIN projects p ON p.id=l.project_id WHERE l.id=? AND p.status='visible'`,
      )
      .bind(id)
      .first<Row>();
    if (!row) return null;
    const p = await this.db
      .prepare(`${projects} WHERE p.id=? AND p.status='visible'`)
      .bind(row.project_id)
      .first<Row>();
    return p ? { launch: launch(row), project: project(p) } : null;
  }
  async listProjects(limit: number, cursor: string | null, query = ''): Promise<Page<Project>> {
    const scope = `projects:${query}`,
      c = decodeCursor(cursor, scope),
      args: unknown[] = [];
    let where = `p.status='visible'`;
    if (query) {
      where += ` AND (p.display_name LIKE ? ESCAPE '\\' OR p.github_owner LIKE ? ESCAPE '\\' OR p.github_repo LIKE ? ESCAPE '\\')`;
      const q = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
      args.push(q, q, q);
    }
    if (c) {
      where += ' AND (p.latest_launched_at < ? OR (p.latest_launched_at = ? AND p.id < ?))';
      args.push(c.time, c.time, c.id);
    }
    const { results } = await this.db
      .prepare(`${projects} WHERE ${where} ORDER BY p.latest_launched_at DESC,p.id DESC LIMIT ?`)
      .bind(...args, limit + 1)
      .all<Row>();
    const rows = results.slice(0, limit),
      last = rows.at(-1);
    return {
      items: rows.map(project),
      nextCursor:
        results.length > limit && last
          ? encodeCursor({ time: String(last.latest_launched_at), id: String(last.id), scope })
          : null,
    };
  }
  async listLaunches(
    limit: number,
    cursor: string | null,
    repositoryId?: number,
  ): Promise<Page<Launch>> {
    const scope = `launches:${repositoryId ?? 'all'}`,
      c = decodeCursor(cursor, scope),
      args: unknown[] = [];
    let where = `p.status='visible'`;
    if (repositoryId) {
      where += ' AND p.github_repository_id=?';
      args.push(repositoryId);
    }
    if (c) {
      where += ' AND (l.recorded_at < ? OR (l.recorded_at = ? AND l.id < ?))';
      args.push(c.time, c.time, c.id);
    }
    const { results } = await this.db
      .prepare(
        `SELECT l.* FROM launches l JOIN projects p ON p.id=l.project_id WHERE ${where} ORDER BY l.recorded_at DESC,l.id DESC LIMIT ?`,
      )
      .bind(...args, limit + 1)
      .all<Row>();
    const rows = results.slice(0, limit),
      last = rows.at(-1);
    return {
      items: rows.map(launch),
      nextCursor:
        results.length > limit && last
          ? encodeCursor({ time: String(last.recorded_at), id: String(last.id), scope })
          : null,
    };
  }
  async moderate(repositoryId: number, hidden: boolean, reason: string) {
    if (!reason.trim() || reason.length > 1000)
      throw new Error('A bounded audit reason is required');
    const pid = `gh:${repositoryId}`;
    await this.db.batch([
      this.db
        .prepare('UPDATE projects SET status=?,updated_at=? WHERE id=?')
        .bind(hidden ? 'hidden' : 'visible', new Date().toISOString(), pid),
      this.db
        .prepare(
          'INSERT INTO moderation_audit(id,project_id,action,reason,created_at) VALUES(?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          pid,
          hidden ? 'hide' : 'unhide',
          reason,
          new Date().toISOString(),
        ),
    ]);
  }
}
