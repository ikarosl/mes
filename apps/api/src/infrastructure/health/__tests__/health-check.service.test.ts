import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthCheckService } from '../health-check.service.js';

type ServiceWithS3 = {
  check: () => Promise<unknown>;
  s3Client: { send: (command: unknown) => Promise<unknown> };
};

const createService = (query: (sql: string) => Promise<unknown>) =>
  new HealthCheckService({ query } as never) as unknown as ServiceWithS3;

describe('HealthCheckService', () => {
  // 构造 HealthCheckService 会读取 S3 必填配置（env.ts）；S3 调用已被 mock，
  // 这里只需满足构造前置条件，不依赖 CI、Turbo 或本地 .env。
  beforeEach(() => {
    vi.stubEnv('S3_BUCKET', 'test-bucket');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports ok when both MySQL and object storage respond', async () => {
    const service = createService(vi.fn().mockResolvedValue([[{ '1': 1 }]]));
    service.s3Client.send = vi.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: { status: 'up' },
      objectStorage: { status: 'up' },
    });
  });

  it('reports degraded and stable database error codes without leaking driver text', async () => {
    const service = createService(vi.fn().mockRejectedValue({ code: 'ECONNREFUSED' }));
    service.s3Client.send = vi.fn().mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      database: { status: 'down', error: 'ECONNREFUSED' },
      objectStorage: { status: 'up' },
    });
  });

  it('reports degraded object storage with an HTTP status code', async () => {
    const service = createService(vi.fn().mockResolvedValue([[{ '1': 1 }]]));
    service.s3Client.send = vi.fn().mockRejectedValue({ $metadata: { httpStatusCode: 503 } });

    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      database: { status: 'up' },
      objectStorage: { status: 'down', error: 'HTTP_503' },
    });
  });
});
