import type { StoredTechnicalFile } from './product.repository.js';
import type { Readable } from 'node:stream';
import type { TechnicalFileLocator } from './product.repository.js';

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
