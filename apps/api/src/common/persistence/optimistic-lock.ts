import { CONCURRENCY_ERROR_CODES } from '@company/constants';

export class ConcurrencyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Maps a zero-row versioned update to a protocol-independent business error. */
export const requireOptimisticUpdate = (affectedRows: number): void => {
  if (affectedRows === 0) {
    throw new ConcurrencyError(
      CONCURRENCY_ERROR_CODES.concurrentModification,
      'The record was modified by another request. Refresh and retry.',
    );
  }
};

export const idempotencyConflict = (): ConcurrencyError =>
  new ConcurrencyError(
    CONCURRENCY_ERROR_CODES.idempotencyConflict,
    'The idempotency key was already used with a different request.',
  );
