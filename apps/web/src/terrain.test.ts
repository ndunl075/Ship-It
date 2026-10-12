import { describe, expect, it } from 'vitest';
import { IcosahedronGeometry } from 'three';
import { createTerrainGeometry } from './terrain';
import { visibleSites } from './world';
import { demoProjects } from './fixtures';

describe('bounded, continuous planet geometry', () => {
  it('keeps every shared terrain vertex joined across neighboring triangle faces', () => {
    const original = new IcosahedronGeometry(2.22, 4), terrain = createTerrainGeometry();
    const before = original.attributes.position, after = terrain.attributes.position;
    const shared = new Map<string, number[]>(); let repeated = 0;
    for (let i = 0; i < before.count; i++) {
      const key = [before.getX(i), before.getY(i), before.getZ(i)].join(',');
      const displaced = [after.getX(i), after.getY(i), after.getZ(i)];
      if (shared.has(key)) { expect(displaced).toEqual(shared.get(key)); repeated++; }
      else shared.set(key, displaced);
    }
    expect(repeated).toBeGreaterThan(500); original.dispose(); terrain.dispose();
  });
  it('always displays a selected project beyond the first 100, without duplication', () => {
    const projects = Array.from({ length: 130 }, (_, i) => ({ ...demoProjects[0], id: `gh:${i + 1}`, githubRepositoryId: i + 1 }));
    const sites = visibleSites(projects, projects[120]);
    expect(sites).toHaveLength(100); expect(sites[0].id).toBe('gh:121'); expect(new Set(sites.map(p => p.id)).size).toBe(100);
  });
});
