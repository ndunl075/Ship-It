import { z } from 'zod';

export const safeUrlSchema = z.string().max(2048).url().refine(value => {
  const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password;
}, 'An HTTPS URL without credentials is required');
export function normalizeUrl(value: unknown): string | null {
  const result = safeUrlSchema.safeParse(value); return result.success ? result.data : null;
}
export const launchInputSchema = z.object({
  schema_version: z.literal(1), repository_id: z.number().int().positive().safe(),
  deployment_id: z.number().int().positive().safe(), environment: z.literal('production'),
  commit_sha: z.string().regex(/^[a-f0-9]{40}$/i)
}).strict();
export type LaunchInput = z.infer<typeof launchInputSchema>;
export const projectSchema = z.object({
  id: z.string(), githubRepositoryId: z.number().int().positive(), owner: z.string(), repository: z.string(),
  name: z.string(), description: z.string().nullable(), repoUrl: safeUrlSchema, homepageUrl: safeUrlSchema.nullable(),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  latestLaunchedAt: z.string().datetime(), launchCount: z.number().int().nonnegative()
});
export type Project = z.infer<typeof projectSchema>;
export const launchSchema = z.object({
  id: z.string(), projectId: z.string(), commitSha: z.string(), environment: z.literal('production'),
  targetUrl: safeUrlSchema.nullable(), deployedAt: z.string().datetime(), recordedAt: z.string().datetime(),
  verifiedBy: z.literal('github-deployment-status')
});
export type Launch = z.infer<typeof launchSchema>;
export const launchResultSchema = z.object({ launch_id: z.string(), project_id: z.string(), duplicate: z.boolean(), launch_url: safeUrlSchema });
export type LaunchResult = z.infer<typeof launchResultSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };
export type World = { projects: Project[]; launches: Launch[]; nextCursor: string | null };
export type LaunchDetail = { launch: Launch; project: Project };

// Fixed seed and uniform spherical sampling keep repository landing sites stable.
function hash(text: string): number {
  let n = 2166136261;
  for (const c of text) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); }
  n ^= n >>> 16; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13;
  return (n >>> 0) / 4294967296;
}
export function landingCoordinates(repositoryId: number): { latitude: number; longitude: number } {
  if (!Number.isSafeInteger(repositoryId) || repositoryId < 1) throw new Error('Invalid repository ID');
  return { latitude: Math.asin(2 * hash(`ship-it-world-v1:lat:${repositoryId}`) - 1) * 180 / Math.PI,
    longitude: hash(`ship-it-world-v1:lon:${repositoryId}`) * 360 - 180 };
}
export function toCartesian(latitude: number, longitude: number, radius = 1): [number, number, number] {
  const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
  return [radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.sin(lon)];
}
