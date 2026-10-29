import type { Readable } from 'node:stream';
import type { TechnicalFileType } from '@company/contracts';
import type { StoredTechnicalFile, TechnicalFileLocator } from './technical-file.repository.js';

export interface TechnicalFileUpload {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export abstract class TechnicalFileStorage {
  abstract store(
    file: TechnicalFileUpload,
    fileType: TechnicalFileType,
  ): Promise<StoredTechnicalFile>;
  abstract read(locator: TechnicalFileLocator): Promise<Readable>;
  abstract remove(locator: TechnicalFileLocator): Promise<void>;
}
