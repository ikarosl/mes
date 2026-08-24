import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import type { TechnicalFileStorageConfig } from '../../../config/env.js';
import { toBeijingCompactTimestamp, toBeijingISOString } from '../../../common/time/date-time.js';
import {
  type TechnicalFileStorage,
  type TechnicalFileUpload,
} from '../application/ports/technical-file.storage.js';
import { ProductDomainError } from '../domain/product.errors.js';

export type S3TechnicalFileStorageOptions = TechnicalFileStorageConfig;

export const createS3Client = (options: S3TechnicalFileStorageOptions) =>
  new S3Client({
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    region: options.region,
    forcePathStyle: options.forcePathStyle,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
    },
  });

export class S3TechnicalFileStorage implements TechnicalFileStorage {
  private readonly client: S3Client;

  constructor(
    private readonly options: S3TechnicalFileStorageOptions,
    client?: S3Client,
  ) {
    this.client = client ?? createS3Client(options);
  }

  async storeSop(file: TechnicalFileUpload) {
    const now = new Date();
    const [beijingDate] = toBeijingISOString(now).split('T');
    const [year, month] = beijingDate.split('-');
    const extension = extname(file.originalName)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 12);
    const objectKey = ['sop', year, month, `${randomUUID()}${extension}`].join('/');
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimeType,
          ContentLength: file.buffer.length,
        }),
      );
    } catch {
      throw new ProductDomainError('STORAGE_UNAVAILABLE', '技术文件存储失败');
    }
    return {
      fileName: file.originalName,
      originalName: file.originalName,
      storageProvider: 's3' as const,
      bucket: this.options.bucket,
      objectKey,
      mimeType: file.mimeType,
      sizeBytes: file.buffer.length,
      checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
      fileType: 'sop' as const,
      versionNo: toBeijingCompactTimestamp(now),
    };
  }

  async read(locator: Parameters<TechnicalFileStorage['read']>[0]) {
    let response;
    try {
      const bucket = this.bucket(locator.bucket);
      response = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: locator.objectKey }),
      );
    } catch {
      throw new ProductDomainError('STORAGE_UNAVAILABLE', '技术文件读取失败');
    }
    if (!(response.Body instanceof Readable)) {
      throw new ProductDomainError('STORAGE_UNAVAILABLE', '技术文件读取失败');
    }
    return response.Body;
  }

  async remove(locator: Parameters<TechnicalFileStorage['remove']>[0]) {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket(locator.bucket),
          Key: locator.objectKey,
        }),
      );
    } catch {
      throw new ProductDomainError('STORAGE_UNAVAILABLE', '技术文件删除失败，可重试此操作');
    }
  }

  private bucket(bucket: string | null) {
    if (!bucket) throw new Error('对象存储桶缺失');
    return bucket;
  }
}
