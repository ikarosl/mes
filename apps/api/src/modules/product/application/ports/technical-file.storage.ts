import type { Readable } from 'node:stream';
import type { StoredTechnicalFile, TechnicalFileLocator } from './technical-file.repository.js';

export interface TechnicalFileUpload {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export abstract class TechnicalFileStorage {
  abstract storeSop(file: TechnicalFileUpload): Promise<StoredTechnicalFile>;
  abstract read(locator: TechnicalFileLocator): Promise<Readable>;
  abstract remove(locator: TechnicalFileLocator): Promise<void>;
}
