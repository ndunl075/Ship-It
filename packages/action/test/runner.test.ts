import { describe, expect, it, vi } from 'vitest';
import {
  apiOrigin,
  deploymentInput,
  register,
  requestJson,
  run,
  type Runtime,
} from '../src/runner';

const sha = 'a'.repeat(40);
const result = {
  launch_id: 'launch-1',
  project_id: 'gh:123',
  duplicate: false,
  launch_url: 'https://planet.example/?launch=launch-1',
};
const json = (data: unknown, status = 200, headers = {}): Response =>
  new Response(JSON.stringify(data), { status, headers });
function runtime(): Runtime {
  return {
    env: {
      INPUT_API_URL: 'https://api.example',
      INPUT_DEPLOYMENT_ID: '77',
      GITHUB_REPOSITORY_ID: '123',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_SHA: 'b'.repeat(40),
      GITHUB_EVENT_NAME: 'deployment_status',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github.example/oidc?x=1',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-secret',
    },
    event: {
      repository: { id: 123, private: false },
      deployment: { id: 77, sha, environment: 'production' },
      deployment_status: { state: 'success' },
    },
    fetch: vi
      .fn()
      .mockResolvedValueOnce(json({ value: 'jwt-secret' }))
      .mockResolvedValueOnce(json(result)),
    sleep: vi.fn().mockResolvedValue(undefined),
    random: () => 0,
    output: vi.fn(),
    summary: vi.fn(),
    warning: vi.fn(),
  };
}

describe('GitHub deployment identity', () => {
  it('uses the deployment SHA rather than the workflow SHA, with exact OIDC audience', async () => {
    const r = runtime();
    await expect(register(r)).resolves.toEqual(result);
    const calls = vi.mocked(r.fetch).mock.calls;
    expect(new URL(String(calls[0][0])).searchParams.get('audience')).toBe('ship-it-api');
    expect(JSON.parse(String(calls[1][1]?.body))).toEqual({
      schema_version: 1,
      repository_id: 123,
      deployment_id: 77,
      environment: 'production',
      commit_sha: sha,
    });
    expect(calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer jwt-secret' });
    expect(calls[1][1]?.redirect).toBe('error');
  });
  it('looks up the actual deployment for final-step workflows', async () => {
    const r = runtime();
    r.env.GITHUB_EVENT_NAME = 'push';
    r.fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 77, sha, environment: 'production' }))
      .mockResolvedValueOnce(json({ value: 'jwt-secret' }))
      .mockResolvedValueOnce(json(result));
    await expect(register(r)).resolves.toEqual(result);
    expect(vi.mocked(r.fetch).mock.calls[0][0]).toBe(
      'https://api.github.com/repos/owner/repo/deployments/77',
    );
    expect(JSON.parse(String(vi.mocked(r.fetch).mock.calls[2][1]?.body)).commit_sha).toBe(sha);
  });
  it.each(['failure', 'pending', 'in_progress', 'inactive'])('rejects status %s', async (state) => {
    const r = runtime();
    (r.event as { deployment_status: { state: string } }).deployment_status.state = state;
    await expect(deploymentInput(r)).rejects.toThrow('successful deployment');
    expect(r.fetch).not.toHaveBeenCalled();
  });
  it('rejects mismatched event IDs, private repositories, preview environments and invalid IDs', async () => {
    for (const env of [
      { INPUT_DEPLOYMENT_ID: '78' },
      { GITHUB_REPOSITORY_ID: '124' },
      { INPUT_ENVIRONMENT: 'preview' },
      { INPUT_DEPLOYMENT_ID: '1e2' },
    ]) {
      const r = runtime();
      Object.assign(r.env, env);
      await expect(deploymentInput(r)).rejects.toThrow();
    }
    const r = runtime();
    (r.event as { repository: { private: boolean } }).repository.private = true;
    await expect(deploymentInput(r)).rejects.toThrow('public repository');
  });
  it('explains missing id-token permission without exposing credentials', async () => {
    const r = runtime();
    delete r.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    await run(r);
    expect(r.warning).toHaveBeenCalledWith(expect.stringContaining('id-token: write'));
  });
});

describe('bounded HTTP and validation', () => {
  it.each([
    'http://api.example',
    'https://user:pass@api.example',
    'https://api.example/v1',
    'https://api.example/?token=secret',
    'https://api.example/#x',
    '',
    'javascript:alert(1)',
  ])('rejects invalid API URL %s', (value) => {
    expect(() => apiOrigin(value)).toThrow('HTTPS origin');
  });
  it('normalizes HTTPS origins', () =>
    expect(apiOrigin('https://api.example/')).toBe('https://api.example'));
  it('retries 429 and 503, respecting bounded Retry-After', async () => {
    const r = runtime();
    r.fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { 'retry-after': '3600' }))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json(result));
    await expect(requestJson(r, 'https://api.example', {}, 'API')).resolves.toEqual(result);
    expect(r.sleep).toHaveBeenNthCalledWith(1, 5000);
    expect(r.sleep).toHaveBeenNthCalledWith(2, 1000);
  });
  it('honors HTTP-date Retry-After with a firm cap', async () => {
    const r = runtime();
    r.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({}, 429, { 'retry-after': new Date(Date.now() + 60000).toUTCString() }),
      )
      .mockResolvedValueOnce(json(result));
    await requestJson(r, 'https://api.example', {}, 'API');
    expect(r.sleep).toHaveBeenCalledWith(5000);
  });
  it('stops retrying network errors after three attempts without leaking exceptions', async () => {
    const r = runtime();
    r.fetch = vi.fn().mockRejectedValue(new Error('jwt-secret'));
    await expect(requestJson(r, 'https://api.example', {}, 'API')).rejects.toThrow(
      'after three attempts',
    );
    expect(r.fetch).toHaveBeenCalledTimes(3);
    expect(r.sleep).toHaveBeenCalledTimes(2);
  });
  it('does not retry validation failures or log server response bodies', async () => {
    const r = runtime();
    r.fetch = vi.fn().mockResolvedValue(json({ secret: 'jwt-secret' }, 403));
    await expect(requestJson(r, 'https://api.example', {}, 'API')).rejects.toThrow('HTTP 403');
    expect(r.fetch).toHaveBeenCalledTimes(1);
    expect(r.sleep).not.toHaveBeenCalled();
  });
  it('times out hanging fetches and response bodies', async () => {
    vi.useFakeTimers();
    try {
      for (const bodyHang of [false, true]) {
        const r = runtime();
        r.fetch = vi.fn().mockImplementation(() =>
          bodyHang
            ? Promise.resolve({
                ok: true,
                headers: new Headers(),
                json: () => new Promise(() => {}),
              })
            : new Promise(() => {}),
        );
        const check = expect(requestJson(r, 'https://api.example', {}, 'API', 10)).rejects.toThrow(
          'after three attempts',
        );
        await vi.runAllTimersAsync();
        await check;
        expect(r.fetch).toHaveBeenCalledTimes(3);
      }
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects malformed success responses', async () => {
    const r = runtime();
    r.fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ value: 'jwt-secret' }))
      .mockResolvedValueOnce(json({ ...result, launch_url: 'javascript:alert(1)' }));
    await expect(register(r)).rejects.toThrow('invalid launch response');
  });
});

describe('optional celebration', () => {
  it('writes outputs and a clear summary for both initial and duplicate launches', async () => {
    for (const duplicate of [true, false]) {
      const r = runtime();
      r.fetch = vi
        .fn()
        .mockResolvedValueOnce(json({ value: 'jwt-secret' }))
        .mockResolvedValueOnce(json({ ...result, duplicate }));
      await run(r);
      expect(r.output).toHaveBeenCalledWith('registered', 'true');
      expect(r.output).toHaveBeenCalledWith('launch_url', result.launch_url);
      expect(r.summary).toHaveBeenCalledWith(
        expect.stringContaining(duplicate ? 'Already registered' : 'Launch registered'),
      );
      expect(r.warning).not.toHaveBeenCalled();
    }
  });
  it('keeps outages nonblocking and never logs a token', async () => {
    const r = runtime();
    r.fetch = vi.fn().mockRejectedValue(new Error('jwt-secret request-secret'));
    await expect(run(r)).resolves.toBeUndefined();
    expect(r.output).toHaveBeenCalledWith('registered', 'false');
    expect(JSON.stringify(vi.mocked(r.warning).mock.calls)).not.toContain('secret');
  });
  it('does not lose registration when the optional summary fails', async () => {
    const r = runtime();
    r.summary = vi.fn().mockImplementation(() => {
      throw new Error('disk full');
    });
    await expect(run(r)).resolves.toBeUndefined();
    expect(r.output).toHaveBeenCalledWith('registered', 'true');
    expect(r.warning).toHaveBeenCalledWith(expect.stringContaining('Launch registered'));
  });
});
