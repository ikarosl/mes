export const CONCURRENCY_ERROR_CODES = {
  concurrentModification: 'CONCURRENT_MODIFICATION',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
} as const;

/** 未启用幂等的端点收到意外 `Idempotency-Key` 头时的拒绝错误码。 */
export const IDEMPOTENCY_NOT_SUPPORTED = 'IDEMPOTENCY_NOT_SUPPORTED';

/**
 * 幂等存储基础设施错误码（`IdempotencyStorageError` 的两类，见 common/idempotency/idempotency.errors.ts）：
 * - 可重试：锁等待/死锁/连接中断等瞬态存储失败，客户端应保留原键重试；
 * - 结果损坏：已保存的幂等结果无法反序列化，确定性失败，不得重试、不得自动换新键，需人工处理。
 */
export const IDEMPOTENCY_STORAGE_RETRYABLE = 'IDEMPOTENCY_STORAGE_RETRYABLE';

export const IDEMPOTENCY_RESULT_CORRUPT = 'IDEMPOTENCY_RESULT_CORRUPT';
