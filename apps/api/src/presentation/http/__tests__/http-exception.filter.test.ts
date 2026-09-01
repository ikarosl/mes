import { BadRequestException, Logger, PayloadTooLargeException } from '@nestjs/common';
import { TECHNICAL_FILE_MAX_SIZE_BYTES } from '@company/constants';
import { DatabaseError } from '@company/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const technicalFileMaxSizeMiB = TECHNICAL_FILE_MAX_SIZE_BYTES / 1024 / 1024;

  afterEach(() => vi.restoreAllMocks());

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

  it('maps Multer file-size rejections to a clear 413 response', () => {
    const multerError = Object.assign(new Error('File too large'), {
      name: 'MulterError',
      code: 'LIMIT_FILE_SIZE',
    });

    const { json, status } = invoke(multerError, '/api/product/process-steps/1/sop');

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PAYLOAD_TOO_LARGE',
        message: `文件大小不能超过 ${technicalFileMaxSizeMiB} MiB`,
      }),
    );
  });

  it('translates framework file-size messages to Chinese', () => {
    const { json, status } = invoke(
      new PayloadTooLargeException('File too large'),
      '/api/product/process-steps/1/sop',
    );

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PAYLOAD_TOO_LARGE',
        message: `文件大小不能超过 ${technicalFileMaxSizeMiB} MiB`,
      }),
    );
  });

  it('does not report the technical-file limit for a generic oversized request', () => {
    const { json, status } = invoke(new PayloadTooLargeException('Payload Too Large'));

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PAYLOAD_TOO_LARGE',
        message: '请求内容过大',
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
        message: '请刷新后重试',
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

  it('logs safe exception types, MySQL fields, stage and redacted stack for unexpected errors', () => {
    const cause = Object.assign(new Error('SQL contains a secret value'), {
      code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      errno: 3819,
      sqlState: 'HY000',
      sqlMessage: 'secret SQL text',
    });
    const error = new DatabaseError(cause, '数据库查询失败');
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    invoke(error, '/api/production/abnormal-dispositions/2/actions/confirm?token=secret');

    expect(log).toHaveBeenCalledOnce();
    const [message, stack] = log.mock.calls[0]!;
    expect(message).toContain('exceptionType=DatabaseError');
    expect(message).toContain('causeType=Error');
    expect(message).toContain('stage=query');
    expect(message).toContain('code=ER_CHECK_CONSTRAINT_VIOLATED');
    expect(message).toContain('errno=3819');
    expect(message).toContain('sqlState=HY000');
    expect(message).toContain('path=/api/production/abnormal-dispositions/2/actions/confirm');
    expect(`${message}\n${stack}`).not.toContain('secret');
    expect(stack).toContain('DatabaseError：[消息已脱敏]');
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
