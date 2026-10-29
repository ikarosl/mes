import { describe, expect, it, vi } from 'vitest';
import { S3TechnicalFileStorage } from '../s3-technical-file.storage.js';

describe('S3TechnicalFileStorage', () => {
  // TODO(technical-file-storage): 验证按用途上传、私有流读取及上传失败补偿的对象命令；高重要性，旧存储入口已移除且正式测试暂缓；获正式测试授权后按统一 store 端口恢复。

  it('rejects a persisted record without a bucket as storage unavailable', async () => {
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
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
});
