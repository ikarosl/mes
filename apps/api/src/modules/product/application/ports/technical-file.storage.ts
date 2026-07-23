import type { StoredTechnicalFile } from './product.repository.js';

export interface TechnicalFileUpload {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export abstract class TechnicalFileStorage {
  abstract storeSop(file: TechnicalFileUpload): Promise<StoredTechnicalFile>;
  abstract remove(objectKey: string): Promise<void>;
}
