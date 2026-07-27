import { CreateBucketCommand, HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import type { TechnicalFileStorageConfig } from '../../../config/env.js';
import { createS3Client } from './s3-technical-file.storage.js';

export interface EnsureS3BucketOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
}

/**
 * 显式的部署初始化能力，不在 API 启动或业务请求期间隐式创建 Bucket。
 * 只报告 Bucket 与状态码，不传播 SDK 中可能包含 endpoint 或签名信息的异常文本。
 */
export const ensureS3Bucket = async (
  config: TechnicalFileStorageConfig,
  client: S3Client = createS3Client(config),
  options: EnsureS3BucketOptions = {},
) => {
  const maxAttempts = options.maxAttempts ?? 30;
  const retryDelayMs = options.retryDelayMs ?? 2_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return { created: false } as const;
    } catch (error) {
      const status = httpStatus(error);
      if (status === 404) {
        try {
          await client.send(
            new CreateBucketCommand({
              Bucket: config.bucket,
              ...(config.region !== 'us-east-1'
                ? { CreateBucketConfiguration: { LocationConstraint: config.region as never } }
                : {}),
            }),
          );
          return { created: true } as const;
        } catch (createError) {
          if (!isRetryable(createError) || attempt === maxAttempts) {
            throw safeBucketError(config.bucket, createError);
          }
        }
      } else if (!isRetryable(error) || attempt === maxAttempts) {
        throw safeBucketError(config.bucket, error);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  throw new Error(`Unable to ensure S3 bucket "${config.bucket}"`);
};

const httpStatus = (error: unknown) => {
  if (!error || typeof error !== 'object') return undefined;
  const metadata = Reflect.get(error, '$metadata');
  if (!metadata || typeof metadata !== 'object') return undefined;
  const status = Reflect.get(metadata, 'httpStatusCode');
  return typeof status === 'number' ? status : undefined;
};

const isRetryable = (error: unknown) => {
  const status = httpStatus(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
};

const safeBucketError = (bucket: string, error: unknown) => {
  const status = httpStatus(error);
  return new Error(`Unable to ensure S3 bucket "${bucket}"${status ? ` (HTTP ${status})` : ''}`);
};
