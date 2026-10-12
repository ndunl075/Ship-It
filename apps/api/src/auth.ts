import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ApiError } from './types';
const issuer = 'https://token.actions.githubusercontent.com';
const githubKeys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`), {
  timeoutDuration: 5000,
});
export type Identity = {
  repositoryId: number;
  repository: string;
  sha: string;
  runId: number;
  runAttempt: number;
  event: string;
};
export async function authenticate(
  header: string | null,
  audience: string,
  keys: JWTVerifyGetKey = githubKeys,
  now = new Date(),
): Promise<Identity> {
  if (audience !== 'ship-it-api' || !header?.startsWith('Bearer ') || header.length > 16384)
    throw new ApiError(401, 'invalid_identity');
  try {
    const { payload: p } = await jwtVerify(header.slice(7), keys, {
      issuer,
      audience,
      algorithms: ['RS256'],
      currentDate: now,
      clockTolerance: 5,
      maxTokenAge: '10m',
      requiredClaims: [
        'exp',
        'iat',
        'nbf',
        'repository_id',
        'repository_visibility',
        'repository',
        'sha',
        'run_id',
        'run_attempt',
        'event_name',
      ],
    });
    const numeric = (v: unknown) =>
      typeof v === 'string' && /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v));
    if (
      !numeric(p.repository_id) ||
      !numeric(p.run_id) ||
      !numeric(p.run_attempt) ||
      p.repository_visibility !== 'public' ||
      typeof p.repository !== 'string' ||
      !/^[\w.-]+\/[\w.-]+$/.test(p.repository) ||
      typeof p.sha !== 'string' ||
      !/^[a-f0-9]{40}$/i.test(p.sha) ||
      typeof p.event_name !== 'string' ||
      !['push', 'workflow_dispatch', 'deployment_status', 'workflow_run', 'release'].includes(
        p.event_name,
      )
    )
      throw new Error('claims');
    return {
      repositoryId: Number(p.repository_id),
      repository: p.repository,
      sha: p.sha.toLowerCase(),
      runId: Number(p.run_id),
      runAttempt: Number(p.run_attempt),
      event: p.event_name,
    };
  } catch {
    throw new ApiError(401, 'invalid_identity');
  }
}
