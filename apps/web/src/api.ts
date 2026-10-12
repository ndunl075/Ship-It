import { launchSchema, projectSchema, type Launch, type LaunchDetail, type Page, type Project, type World } from '@ship-it/shared';
import { z } from 'zod';
import { demoLaunches, demoProjects } from './fixtures';

const origin = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');
export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true' || (!origin && import.meta.env.VITE_DEMO_MODE !== 'false');
const pageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });
async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  if (!origin) throw new Error('The public planet API has not been connected yet. Try the local demo or configure VITE_API_ORIGIN.');
  const response = await fetch(`${origin}/v1/${path}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 404 ? 'This project or launch could not be found.' : 'Mission control is temporarily unavailable. Please try again.');
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Mission control returned an unexpected response. Please try again later.');
  return parsed.data;
}
export function paginate<T>(items: T[], cursor: string | null = null, limit = 8): Page<T> {
  const start = Math.max(0, Number(cursor) || 0);
  return { items: items.slice(start, start + limit), nextCursor: start + limit < items.length ? String(start + limit) : null };
}
const params = (values: Record<string, string | null>) => new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== null)).toString();
export const api = {
  world: async (signal?: AbortSignal, cursor: string | null = null): Promise<World> => isDemo ? { projects: demoProjects, launches: demoLaunches.slice(0, 16), nextCursor: null } : read(`world?${params({ limit: '100', cursor })}`, z.object({ projects: z.array(projectSchema), launches: z.array(launchSchema), nextCursor: z.string().nullable() }), signal),
  projects: async (query: string, cursor: string | null, signal?: AbortSignal): Promise<Page<Project>> => isDemo ? paginate(demoProjects.filter(p => `${p.name} ${p.owner} ${p.repository}`.toLowerCase().includes(query.toLowerCase())), cursor) : read(`projects?${params({ query, cursor, limit: '20' })}`, pageSchema(projectSchema), signal),
  project: async (id: string, signal?: AbortSignal): Promise<Project> => {
    if (!isDemo) return read(`projects/${encodeURIComponent(id.replace(/^gh:/, ''))}`, projectSchema, signal);
    const project = demoProjects.find(p => p.id === id || String(p.githubRepositoryId) === id);
    if (!project) throw new Error('This project could not be found in the demo.');
    return project;
  },
  launches: async (cursor: string | null = null, signal?: AbortSignal): Promise<Page<Launch>> => isDemo ? paginate(demoLaunches, cursor, 16) : read(`launches?${params({ cursor, limit: '30' })}`, pageSchema(launchSchema), signal),
  history: async (id: number, cursor: string | null, signal?: AbortSignal): Promise<Page<Launch>> => isDemo ? paginate(demoLaunches.filter(l => l.projectId === `gh:${id}`), cursor, 5) : read(`projects/${id}/launches?${params({ cursor, limit: '10' })}`, pageSchema(launchSchema), signal),
  launch: async (id: string, signal?: AbortSignal): Promise<LaunchDetail> => {
    if (!isDemo) return read(`launches/${encodeURIComponent(id)}`, z.object({ project: projectSchema, launch: launchSchema }), signal);
    const launch = demoLaunches.find(l => l.id === id), project = demoProjects.find(p => p.id === launch?.projectId);
    if (!launch || !project) throw new Error('This launch could not be found in the demo.');
    return { launch, project };
  },
};
