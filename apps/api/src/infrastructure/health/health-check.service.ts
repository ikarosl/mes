import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { loadTechnicalFileStorageConfig } from '../../config/env.js';
import { DATABASE_POOL } from '../database/database.module.js';

export type HealthDependencyStatus = 'up' | 'down';
export type HealthDependency = { status: 'up' } | { status: 'down'; error?: string };

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  database: HealthDependency;
  objectStorage: HealthDependency;
}

@Injectable()
export class HealthCheckService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    const config = loadTechnicalFileStorageConfig();
    this.bucket = config.bucket;
    this.s3Client = new S3Client({
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
      },
    });
  }

  async check(): Promise<HealthCheckResult> {
    const [database, objectStorage] = await Promise.all([
      this.checkDatabase(),
      this.checkObjectStorage(),
    ]);
    return {
      status: database.status === 'up' && objectStorage.status === 'up' ? 'ok' : 'degraded',
      database,
      objectStorage,
    };
  }

  private async checkDatabase(): Promise<HealthDependency> {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', error: safeErrorCode(error) };
    }
  }

  private async checkObjectStorage(): Promise<HealthDependency> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', error: safeErrorCode(error) };
    }
  }
}

/**
 * 健康检查响应不得泄露端点、凭证或 SDK 请求文本。
 * 只保留稳定的错误码（ECONNREFUSED/ETIMEDOUT/HTTP 状态码）。
 */
const safeErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const metadata = Reflect.get(error, '$metadata');
  if (metadata && typeof metadata === 'object') {
    const status = Reflect.get(metadata, 'httpStatusCode');
    if (typeof status === 'number') return `HTTP_${status}`;
  }
  const code = Reflect.get(error, 'code');
  if (typeof code === 'string') return code;
  const name = Reflect.get(error, 'name');
  if (typeof name === 'string' && name !== 'Error') return name;
  return undefined;
};
