import type { Project } from '@ship-it/shared';

export function visibleSites(
  projects: Project[],
  selected: Project | null,
  limit = 100,
): Project[] {
  return selected
    ? [selected, ...projects.filter((p) => p.id !== selected.id)].slice(0, limit)
    : projects.slice(0, limit);
}
