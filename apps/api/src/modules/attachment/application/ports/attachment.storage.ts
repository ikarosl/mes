import type { Readable } from 'node:stream';
import type { TechnicalFileStorageProvider, TechnicalFileType } from '@company/contracts';

export interface AttachmentUpload {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface StoredAttachment {
  fileName: string;
  originalName: string;
  storageProvider: TechnicalFileStorageProvider;
  bucket: string | null;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  fileType: TechnicalFileType;
  versionNo: string | null;
}

export type AttachmentLocator = Pick<StoredAttachment, 'storageProvider' | 'bucket' | 'objectKey'>;

export abstract class AttachmentStorage {
  abstract store(
    file: AttachmentUpload,
    fileType: TechnicalFileType,
    versionNo: string | null,
  ): Promise<StoredAttachment>;
  abstract read(locator: AttachmentLocator): Promise<Readable>;
  abstract remove(locator: AttachmentLocator): Promise<void>;
}
