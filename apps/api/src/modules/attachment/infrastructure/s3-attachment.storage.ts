import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import type { OnModuleDestroy } from '@nestjs/common';
import type { TechnicalFileType } from '@company/contracts';
import type { TechnicalFileStorageConfig } from '../../../config/env.js';
import { toBeijingISOString } from '../../../common/time/date-time.js';
import {
  AttachmentStorage,
  type AttachmentLocator,
  type AttachmentUpload,
  type StoredAttachment,
} from '../application/ports/attachment.storage.js';
import { AttachmentError } from '../domain/attachment.errors.js';

export const createS3Client = (options: TechnicalFileStorageConfig): S3Client =>
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

export class S3AttachmentStorage implements AttachmentStorage, OnModuleDestroy {
  private readonly client: S3Client;

  constructor(
    private readonly options: TechnicalFileStorageConfig,
    client?: S3Client,
  ) {
    this.client = client ?? createS3Client(options);
  }

  async store(
    file: AttachmentUpload,
    fileType: TechnicalFileType,
    versionNo: string | null,
  ): Promise<StoredAttachment> {
    const [beijingDate] = toBeijingISOString(new Date()).split('T');
    const [year, month] = beijingDate.split('-');
    const extension = extname(file.originalName)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 12);
    const objectKey = [fileType, year, month, `${randomUUID()}${extension}`].join('/');
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
      throw new AttachmentError('STORAGE_UNAVAILABLE', '附件存储失败');
    }
    return {
      fileName: file.originalName,
      originalName: file.originalName,
      storageProvider: 's3',
      bucket: this.options.bucket,
      objectKey,
      mimeType: file.mimeType,
      sizeBytes: file.buffer.length,
      checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
      fileType,
      versionNo,
    };
  }

  async read(locator: AttachmentLocator): Promise<Readable> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket(locator), Key: locator.objectKey }),
      );
      if (response.Body instanceof Readable) return response.Body;
    } catch {
      throw new AttachmentError('STORAGE_UNAVAILABLE', '附件读取失败');
    }
    throw new AttachmentError('STORAGE_UNAVAILABLE', '附件读取失败');
  }

  async remove(locator: AttachmentLocator): Promise<void> {
    const bucket = this.bucket(locator);
    try {
      // 版本桶的普通 DeleteObject 仅生成删除标记，不能据此声称已物理清理。
      await this.requireUnversioned(bucket);
      await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: locator.objectKey }));
      await this.requireUnversioned(bucket);
      await this.requireObjectAbsent(bucket, locator.objectKey);
    } catch (error) {
      if (error instanceof AttachmentError) throw error;
      throw new AttachmentError('STORAGE_UNAVAILABLE', '附件清理失败，可稍后重试');
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  private bucket(locator: AttachmentLocator): string {
    if (locator.storageProvider !== 's3' || !locator.bucket)
      throw new AttachmentError('STORAGE_UNAVAILABLE', '附件对象定位不可用');
    return locator.bucket;
  }

  private async requireUnversioned(bucket: string): Promise<void> {
    const response = await this.client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    if (response.Status)
      throw new AttachmentError(
        'VERSIONED_BUCKET_UNSUPPORTED',
        '存储桶已启用过版本控制，当前不支持物理清理',
      );
  }

  private async requireObjectAbsent(bucket: string, objectKey: string): Promise<void> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    } catch (error) {
      if (httpStatus(error) === 404) return;
      throw error;
    }
    throw new AttachmentError('STORAGE_UNAVAILABLE', '附件对象仍然存在，可稍后重试清理');
  }
}

const httpStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const metadata: unknown = Reflect.get(error, '$metadata');
  if (!metadata || typeof metadata !== 'object') return undefined;
  const status: unknown = Reflect.get(metadata, 'httpStatusCode');
  return typeof status === 'number' ? status : undefined;
};
