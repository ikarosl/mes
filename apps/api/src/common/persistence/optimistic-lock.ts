import { ConflictException } from '@nestjs/common';
import { CONCURRENCY_ERROR_CODES } from '@company/constants';

/** Maps a zero-row versioned update to the API's stable concurrency response. */
export const requireOptimisticUpdate = (affectedRows: number) => {
  if (affectedRows === 0) {
    throw new ConflictException({
      code: CONCURRENCY_ERROR_CODES.concurrentModification,
      message: 'The record was modified by another request. Refresh and retry.',
    });
  }
};

export const idempotencyConflict = () =>
  new ConflictException({
    code: CONCURRENCY_ERROR_CODES.idempotencyConflict,
    message: 'The idempotency key was already used with a different request.',
  });
