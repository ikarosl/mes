import { CONCURRENCY_ERROR_CODES } from '@company/constants';

export class ConcurrencyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 将受版本控制的零行更新映射为与协议无关的业务错误。 */
export const requireOptimisticUpdate = (affectedRows: number): void => {
  if (affectedRows === 0) {
    throw new ConcurrencyError(
      CONCURRENCY_ERROR_CODES.concurrentModification,
      '记录已被其他请求修改，请刷新后重试。',
    );
  }
};

export const idempotencyConflict = (): ConcurrencyError =>
  new ConcurrencyError(
    CONCURRENCY_ERROR_CODES.idempotencyConflict,
    '幂等键已被其他请求使用，请勿复用同一幂等键提交不同内容。',
  );
