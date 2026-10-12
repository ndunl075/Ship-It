import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('executes the checked-in self-contained Action bundle with real runner files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ship-it-action-'));
  const event = join(directory, 'event.json');
  const output = join(directory, 'output');
  const summary = join(directory, 'summary');
  try {
    writeFileSync(
      event,
      JSON.stringify({
        repository: { id: 123, private: false },
        deployment: { id: 77, sha: 'a'.repeat(40), environment: 'production' },
        deployment_status: { state: 'success' },
      }),
    );
    writeFileSync(output, '');
    writeFileSync(summary, '');
    const result = {
      launch_id: 'bundle-launch',
      project_id: 'gh:123',
      duplicate: true,
      launch_url: 'https://planet.example/?launch=bundle-launch',
    };
    const preload = `globalThis.fetch = async (url, options) => {
      if (String(url).includes('/oidc')) {
        if (new URL(url).searchParams.get('audience') !== 'ship-it-api') throw Error('audience');
        return Response.json({value:'test-jwt'});
      }
      const body = JSON.parse(options.body);
      if (body.commit_sha !== '${'a'.repeat(40)}' || options.headers.Authorization !== 'Bearer test-jwt') throw Error('identity');
      return Response.json(${JSON.stringify(result)});
    };`;
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        `data:text/javascript,${encodeURIComponent(preload)}`,
        fileURLToPath(new URL('../dist/index.js', import.meta.url)),
      ],
      {
        env: {
          ...process.env,
          GITHUB_EVENT_PATH: event,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
          INPUT_API_URL: 'https://api.example',
          INPUT_DEPLOYMENT_ID: '77',
          INPUT_ENVIRONMENT: 'production',
          GITHUB_REPOSITORY_ID: '123',
          GITHUB_EVENT_NAME: 'deployment_status',
          GITHUB_SHA: 'b'.repeat(40),
          ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github.example/oidc',
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-request-secret',
        },
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).not.toContain('warning');
    expect(child.stdout).not.toContain('test-jwt');
    expect(readFileSync(output, 'utf8')).toContain('registered=true\n');
    expect(readFileSync(output, 'utf8')).toContain('launch_id=bundle-launch\n');
    expect(readFileSync(summary, 'utf8')).toContain('Already registered');
  } finally {
    for (const file of [event, output, summary]) unlinkSync(file);
    rmdirSync(directory);
  }
});
