import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
describe('read-only public client', () => {
  it('opens an entirely local sandbox from a configured production build', async () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://planet.example'); vi.stubEnv('VITE_DEMO_MODE', 'false');
    vi.stubGlobal('location', { search: '?demo=1&launch=sim-0-0' }); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { api, isDemo, isSandbox } = await import('./api');
    expect(isDemo).toBe(true); expect(isSandbox).toBe(true); expect((await api.launch('sim-0-0')).project.id).toBe('gh:800000'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses the configured API, preserves cursors, and never sends write credentials', async () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://planet.example/'); vi.stubEnv('VITE_DEMO_MODE', 'false');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: 'next' })));
    vi.stubGlobal('fetch', fetcher); const { api } = await import('./api');
    expect(await api.projects('hello & world', 'a+b')).toEqual({ items: [], nextCursor: 'next' });
    expect(fetcher.mock.calls[0][0]).toBe('https://planet.example/v1/projects?query=hello+%26+world&cursor=a%2Bb&limit=20');
    expect(fetcher.mock.calls[0][1].headers).toEqual({ Accept: 'application/json' });
  });
  it('rejects malformed responses before rendering them', async () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://planet.example'); vi.stubEnv('VITE_DEMO_MODE', 'false');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [{ homepageUrl: 'javascript:alert(1)' }], launches: [], nextCursor: null }))));
    const { api } = await import('./api'); await expect(api.world()).rejects.toThrow('unexpected response');
  });
  it('keeps demo data local and supports project history', async () => {
    vi.stubEnv('VITE_API_ORIGIN', ''); vi.stubEnv('VITE_DEMO_MODE', 'true'); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { api } = await import('./api'); const world = await api.world(); const p = world.projects[0]; const history = await api.history(p.githubRepositoryId, null);
    expect(history.items.every(l => l.projectId === p.id)).toBe(true); expect(history.nextCursor).not.toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
});
