import { describe, expect, it, vi } from 'vitest';
import { ensureS3Bucket } from '../s3-bucket.js';

const config = {
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  bucket: 'technical-files',
  accessKeyId: 'minio',
  secretAccessKey: 'secret',
  forcePathStyle: true,
};

describe('ensureS3Bucket', () => {
  it('keeps an existing bucket unchanged', async () => {
    const send = vi.fn().mockResolvedValue({});

    await expect(ensureS3Bucket(config, { send } as never)).resolves.toEqual({
      created: false,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0].constructor.name).toBe('HeadBucketCommand');
  });

  it('creates a missing bucket', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
      .mockResolvedValueOnce({});

    await expect(ensureS3Bucket(config, { send } as never)).resolves.toEqual({ created: true });
    expect(send.mock.calls[1]?.[0].constructor.name).toBe('CreateBucketCommand');
  });

  it('sanitizes non-retryable storage errors', async () => {
    const send = vi.fn().mockRejectedValue({
      $metadata: { httpStatusCode: 403 },
      message: 'secret=http://user:password@storage.internal',
    });

    await expect(
      ensureS3Bucket(config, { send } as never, { maxAttempts: 1, retryDelayMs: 0 }),
    ).rejects.toThrow('Unable to ensure S3 bucket "technical-files" (HTTP 403)');
    await expect(
      ensureS3Bucket(config, { send } as never, { maxAttempts: 1, retryDelayMs: 0 }),
    ).rejects.not.toThrow('password');
  });
});
