import { describe, expect, it } from 'vitest';
import { landingCoordinates, launchInputSchema, normalizeUrl, toCartesian } from './index';
describe('shared contracts', () => {
  it('rejects forged fields and unsafe URLs', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('https://user:secret@example.org')).toBeNull();
    expect(
      launchInputSchema.safeParse({
        schema_version: 1,
        repository_id: 1,
        deployment_id: 2,
        environment: 'preview',
        commit_sha: 'a'.repeat(40),
      }).success,
    ).toBe(false);
  });
  it('places projects stably and evenly on a unit sphere', () => {
    expect(landingCoordinates(123)).toEqual(landingCoordinates(123));
    let y = 0;
    for (let id = 1; id <= 10000; id++) {
      const p = landingCoordinates(id),
        xyz = toCartesian(p.latitude, p.longitude);
      expect(Math.hypot(...xyz)).toBeCloseTo(1);
      y += xyz[1];
    }
    expect(Math.abs(y / 10000)).toBeLessThan(0.03);
  });
});
