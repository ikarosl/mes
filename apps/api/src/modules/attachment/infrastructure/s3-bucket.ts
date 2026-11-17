import { CreateBucketCommand, HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import type { TechnicalFileStorageConfig } from '../../../config/env.js';
import { createS3Client } from './s3-attachment.storage.js';

export interface EnsureS3BucketOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
}

/** 仅用于显式部署初始化，不在 API 启动或普通业务请求期间隐式创建 Bucket。 */
export const ensureS3Bucket = async (
  config: TechnicalFileStorageConfig,
  client: S3Client = createS3Client(config),
  options: EnsureS3BucketOptions = {},
): Promise<{ created: boolean }> => {
  const maxAttempts = options.maxAttempts ?? 30;
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return { created: false };
    } catch (error) {
      if (httpStatus(error) === 404) {
        try {
          await client.send(
            new CreateBucketCommand({
              Bucket: config.bucket,
              ...(config.region !== 'us-east-1'
                ? { CreateBucketConfiguration: { LocationConstraint: config.region as never } }
                : {}),
            }),
          );
          return { created: true };
        } catch (createError) {
          if (!isRetryable(createError) || attempt === maxAttempts)
            throw safeBucketError(config.bucket, createError);
        }
      } else if (!isRetryable(error) || attempt === maxAttempts)
        throw safeBucketError(config.bucket, error);
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  throw new Error(`无法确认 S3 存储桶“${config.bucket}”状态`);
};

const httpStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const metadata: unknown = Reflect.get(error, '$metadata');
  if (!metadata || typeof metadata !== 'object') return undefined;
  const status: unknown = Reflect.get(metadata, 'httpStatusCode');
  return typeof status === 'number' ? status : undefined;
};
const isRetryable = (error: unknown): boolean => {
  const status = httpStatus(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
};
const safeBucketError = (bucket: string, error: unknown): Error => {
  const status = httpStatus(error);
  return new Error(`无法确认 S3 存储桶“${bucket}”状态${status ? `（HTTP ${status}）` : ''}`);
};
