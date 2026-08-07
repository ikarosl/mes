/**
 * 协议无关的幂等基础设施错误。
 *
 * 冲突错误继续复用 `common/persistence/optimistic-lock.ts` 的 `idempotencyConflict()`，
 * 不在此处定义第二套同码错误；本文件只补充存储/持久化失败。
 */

/** 幂等记录存储/持久化失败。kind=retryable 表示可安全重试；corrupt 表示已保存结果损坏、不得重试。 */
export class IdempotencyStorageError extends Error {
  constructor(
    readonly kind: 'retryable' | 'corrupt',
    message: string,
  ) {
    super(message);
    this.name = 'IdempotencyStorageError';
  }
}
