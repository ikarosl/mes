import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig, loadTechnicalFileStorageConfig } from '../env.js';

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

describe('loadTechnicalFileStorageConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('loads an S3-compatible endpoint with path style by default', () => {
    vi.stubEnv('S3_ENDPOINT', 'http://127.0.0.1:9000');
    vi.stubEnv('S3_BUCKET', 'technical-files');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'minio');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'secret');
    vi.stubEnv('S3_FORCE_PATH_STYLE', '');

    expect(loadTechnicalFileStorageConfig()).toMatchObject({
      endpoint: 'http://127.0.0.1:9000',
      region: 'us-east-1',
      bucket: 'technical-files',
      forcePathStyle: true,
    });
  });

  it('rejects missing S3 bucket and credentials', () => {
    vi.stubEnv('S3_BUCKET', '');
    vi.stubEnv('S3_ACCESS_KEY_ID', '');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', '');

    expect(() => loadTechnicalFileStorageConfig()).toThrow('S3_BUCKET');
  });

  it('uses virtual-hosted style without a custom endpoint and validates booleans', () => {
    stubS3Env();
    vi.stubEnv('S3_ENDPOINT', '');
    vi.stubEnv('S3_FORCE_PATH_STYLE', '');

    expect(loadTechnicalFileStorageConfig().forcePathStyle).toBe(false);

    vi.stubEnv('S3_FORCE_PATH_STYLE', 'yes');
    expect(() => loadTechnicalFileStorageConfig()).toThrow('S3_FORCE_PATH_STYLE');
  });

  it('rejects an invalid endpoint without exposing credentials', () => {
    stubS3Env();
    vi.stubEnv('S3_ENDPOINT', 'not-a-url');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'top-secret');

    try {
      loadTechnicalFileStorageConfig();
      throw new Error('expected config validation to fail');
    } catch (error) {
      expect(String(error)).toContain('S3_ENDPOINT must be a valid URL');
      expect(String(error)).not.toContain('top-secret');
    }
  });
});

const stubRequiredEnv = () => {
  vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters');
  vi.stubEnv('JWT_ISSUER', 'test-issuer');
  vi.stubEnv('JWT_AUDIENCE', 'test-audience');
};

const stubS3Env = () => {
  vi.stubEnv('S3_BUCKET', 'technical-files');
  vi.stubEnv('S3_ACCESS_KEY_ID', 'access-key');
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'secret');
};
