import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../http-exception.filter.js';
import { ConcurrencyError } from '../../../common/persistence/optimistic-lock.js';
import { IdempotencyStorageError } from '../../../common/idempotency/idempotency.errors.js';

const invoke = (exception: unknown, url = '/api/system/users') => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: url, headers: { 'x-request-id': 'request_1234' } }),
      getResponse: () => ({ status, setHeader }),
    }),
  };

  new HttpExceptionFilter().catch(exception, host as never);
  return { json, status, setHeader };
};

describe('HttpExceptionFilter', () => {
  it('returns one safe envelope for expected HTTP exceptions', () => {
    const { json, status, setHeader } = invoke(new BadRequestException('参数错误'));

    expect(status).toHaveBeenCalledWith(400);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request_1234');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        code: 'BAD_REQUEST',
        message: '参数错误',
        requestId: 'request_1234',
        path: '/api/system/users',
        timestamp: expect.stringMatching(/\+08:00$/),
      }),
    );
  });

  it('maps protocol-independent concurrency errors to the stable 409 envelope', () => {
    const { json, status } = invoke(
      new ConcurrencyError('CONCURRENT_MODIFICATION', 'Refresh and retry'),
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 409,
        code: 'CONCURRENT_MODIFICATION',
        message: 'Refresh and retry',
      }),
    );
  });

  it('does not expose unexpected exception messages', () => {
    const { json } = invoke(new Error('SELECT password_hash FROM users'));

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误，请稍后重试',
      }),
    );
  });

  it('maps retryable idempotency storage failures to 503 with a stable code', () => {
    const { json, status } = invoke(
      new IdempotencyStorageError('retryable', '幂等登记竞态，请重试'),
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 503,
        code: 'IDEMPOTENCY_STORAGE_RETRYABLE',
        message: '幂等登记竞态，请重试',
      }),
    );
  });

  it('maps corrupt idempotency results to 500 with a stable code', () => {
    const { json, status } = invoke(
      new IdempotencyStorageError('corrupt', '已保存的幂等结果无法反序列化'),
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        code: 'IDEMPOTENCY_RESULT_CORRUPT',
        message: '已保存的幂等结果无法反序列化',
      }),
    );
  });
});
