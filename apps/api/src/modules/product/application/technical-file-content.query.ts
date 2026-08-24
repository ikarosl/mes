import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { ProductDomainError } from '../domain/product.errors.js';
import { TechnicalFileRepository } from './ports/technical-file.repository.js';
import { TechnicalFileStorage } from './ports/technical-file.storage.js';

export interface HistoricalTechnicalFileSnapshotLocator {
  fileId: string;
  objectKey: string;
}

export interface HistoricalTechnicalFileContent {
  mimeType: string;
  sizeBytes: number;
  stream: Readable;
}

/** Product 模块公开的只读对象内容边界；调用方负责业务授权和快照定位。 */
@Injectable()
export class TechnicalFileContentQuery {
  constructor(
    private readonly files: TechnicalFileRepository,
    private readonly storage: TechnicalFileStorage,
  ) {}

  async readHistoricalSnapshot(
    snapshot: HistoricalTechnicalFileSnapshotLocator,
  ): Promise<HistoricalTechnicalFileContent> {
    const file = await this.files.getHistoricalTechnicalFileLocator(snapshot.fileId);
    if (file.objectKey !== snapshot.objectKey)
      throw new ProductDomainError('NOT_FOUND', '历史技术文件与生产快照不一致');
    return {
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      stream: await this.storage.read(file),
    };
  }
}
