import { createHash } from 'node:crypto';

/**
 * 幂等键脱敏摘要（apps/api/docs/idempotency.md §8）：日志与指标只记录摘要，不打印
 * 原始幂等键，避免把客户端意图标识写进可检索日志。摘要用 SHA-256 前 12 位，足以在排查时关联同一条
 * 记录而不泄露原始键。
 */
export const maskedKeyDigest = (key: string): string =>
  createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 12);
