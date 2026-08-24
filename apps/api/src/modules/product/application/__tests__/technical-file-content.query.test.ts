import { describe, expect, it, vi } from 'vitest';
import { TechnicalFileContentQuery } from '../technical-file-content.query.js';

describe('TechnicalFileContentQuery historical snapshots', () => {
  it('reads soft-deleted file metadata only when its immutable object key matches', async () => {
    const file = {
      storageProvider: 's3',
      bucket: 'files',
      objectKey: 'sop/v1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12,
    };
    const files = { getHistoricalTechnicalFileLocator: vi.fn().mockResolvedValue(file) };
    const storage = { read: vi.fn().mockResolvedValue('stream') };
    const query = new TechnicalFileContentQuery(files as never, storage as never);

    await expect(
      query.readHistoricalSnapshot({ fileId: '5', objectKey: 'sop/v1.pdf' }),
    ).resolves.toEqual({ mimeType: 'application/pdf', sizeBytes: 12, stream: 'stream' });
    expect(storage.read).toHaveBeenCalledWith(file);
  });

  it('rejects a file id whose object key differs from the production snapshot', async () => {
    const files = {
      getHistoricalTechnicalFileLocator: vi.fn().mockResolvedValue({
        storageProvider: 's3',
        bucket: 'files',
        objectKey: 'sop/other.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12,
      }),
    };
    const storage = { read: vi.fn() };
    const query = new TechnicalFileContentQuery(files as never, storage as never);

    await expect(
      query.readHistoricalSnapshot({ fileId: '5', objectKey: 'sop/v1.pdf' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(storage.read).not.toHaveBeenCalled();
  });
});
