import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import {
  TechnicalFileStorage,
  type TechnicalFileUpload,
} from '../application/ports/technical-file.storage.js';

@Injectable()
export class LocalTechnicalFileStorage implements TechnicalFileStorage {
  private readonly root = resolve(process.env.MES_FILE_STORAGE_PATH || 'storage/technical-files');

  async storeSop(file: TechnicalFileUpload) {
    const now = new Date();
    const extension = extname(file.originalName)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 12);
    const objectKey = [
      'sop',
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}${extension}`,
    ].join('/');
    const absolutePath = this.resolveObjectKey(objectKey);
    await mkdir(resolve(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });
    return {
      fileName: file.originalName,
      originalName: file.originalName,
      storageProvider: 'local' as const,
      bucket: null,
      objectKey,
      mimeType: file.mimeType,
      sizeBytes: file.buffer.length,
      checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
      fileType: 'sop' as const,
      versionNo: now
        .toISOString()
        .replace(/[-:.TZ]/g, '')
        .slice(0, 14),
    };
  }

  async remove(objectKey: string) {
    await unlink(this.resolveObjectKey(objectKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  private resolveObjectKey(objectKey: string) {
    const target = resolve(this.root, ...objectKey.split('/'));
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error('Invalid technical file object key');
    }
    return target;
  }
}
