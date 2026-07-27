import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { S3TechnicalFileStorage } from '../s3-technical-file.storage.js';

describe('S3TechnicalFileStorage', () => {
  it('uses S3 commands for upload, stream and idempotent deletion', async () => {
    const body = Readable.from(Buffer.from('download'));
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Body: body })
      .mockResolvedValueOnce({});
    const storage = new S3TechnicalFileStorage(
      {
        endpoint: 'http://127.0.0.1:9000',
        region: 'us-east-1',
        bucket: 'technical-files',
        accessKeyId: 'minio',
        secretAccessKey: 'secret',
        forcePathStyle: true,
      },
      { send } as never,
    );

    const stored = await storage.storeSop({
      originalName: 'SOP.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('upload'),
    });

    expect(stored).toMatchObject({ storageProvider: 's3', bucket: 'technical-files' });
    expect(stored.objectKey).toMatch(/^sop\/\d{4}\/\d{2}\/.+\.pdf$/);
    expect(send.mock.calls[0]?.[0].constructor.name).toBe('PutObjectCommand');
    await expect(storage.read(stored)).resolves.toBe(body);
    expect(send.mock.calls[1]?.[0].constructor.name).toBe('GetObjectCommand');
    await storage.remove(stored);
    expect(send.mock.calls[2]?.[0].constructor.name).toBe('DeleteObjectCommand');
  });

  it('rejects a persisted record without a bucket', async () => {
    const storage = new S3TechnicalFileStorage(
      {
        region: 'us-east-1',
        bucket: 'technical-files',
        accessKeyId: 'minio',
        secretAccessKey: 'secret',
        forcePathStyle: true,
      },
      { send: vi.fn() } as never,
    );

    await expect(
      storage.read({ storageProvider: 's3', bucket: null, objectKey: 'sop/a' }),
    ).rejects.toThrow('Object storage bucket is missing');
  });
});
