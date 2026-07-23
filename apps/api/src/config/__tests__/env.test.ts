import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig } from '../env.js';

describe('loadAppConfig token TTLs', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads access and refresh token TTLs from the workspace environment', () => {
    stubRequiredEnv();
    vi.stubEnv('ACCESS_TOKEN_TTL_SECONDS', '10');
    vi.stubEnv('REFRESH_TOKEN_TTL_SECONDS', '20');

    const config = loadAppConfig();

    expect(config.accessTokenTtlSeconds).toBe(10);
    expect(config.refreshTokenTtlSeconds).toBe(20);
  });

  it('rejects a non-positive token TTL', () => {
    stubRequiredEnv();
    vi.stubEnv('ACCESS_TOKEN_TTL_SECONDS', '0');

    expect(() => loadAppConfig()).toThrow('ACCESS_TOKEN_TTL_SECONDS must be a positive integer');
  });
});

const stubRequiredEnv = () => {
  vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters');
  vi.stubEnv('JWT_ISSUER', 'test-issuer');
  vi.stubEnv('JWT_AUDIENCE', 'test-audience');
};
