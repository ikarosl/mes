import { BadRequestException, ConflictException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AuditRepository } from '../../../application/ports/audit.repository.js';
import { ConcurrencyError } from '../../../../../common/persistence/optimistic-lock.js';
import { IdempotencyStorageError } from '../../../../../common/idempotency/idempotency.errors.js';
import {
  AuditInterceptor,
  auditErrorCode,
  auditFailureRemark,
  idempotencyStorageStatus,
} from '../audit.interceptor.js';

describe('audit failure remarks', () => {
  it('does not persist raw exception messages', () => {
    expect(auditFailureRemark(new Error('SELECT password_hash FROM users'))).toBe(
      'Unhandled request failure',
    );
  });

  it('retains the safe status of expected HTTP errors', () => {
    expect(auditFailureRemark(new BadRequestException('password=secret'))).toBe('HTTP 400');
  });

  it('retains a stable application error code for failed audits', () => {
    expect(
      auditErrorCode(new ConflictException({ code: 'CONCURRENT_MODIFICATION', message: 'stale' })),
    ).toBe('CONCURRENT_MODIFICATION');
  });

  it('does not turn a successful operation into a failure when generic audit storage is down', async () => {
    const writeLog = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const interceptor = new AuditInterceptor(
      { writeLog } as unknown as AuditRepository,
      { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector,
    );

    const result = await lastValueFrom(
      interceptor.intercept(httpContext() as never, { handle: () => of({ id: '1' }) }),
    );

    expect(result).toEqual({ id: '1' });
    expect(writeLog).toHaveBeenCalledOnce();
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request_1234', httpMethod: 'POST', httpStatus: 201 }),
    );
  });

  it('skips duplicate success logging when the application transaction owns the audit', async () => {
    const writeLog = vi.fn();
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const interceptor = new AuditInterceptor({ writeLog } as unknown as AuditRepository, reflector);

    await lastValueFrom(
      interceptor.intercept(httpContext() as never, { handle: () => of({ success: true }) }),
    );

    expect(writeLog).not.toHaveBeenCalled();
  });

  it('records an idempotency conflict as HTTP 409 with its stable error code in the failure audit', async () => {
    const writeLog = vi.fn().mockResolvedValue(undefined);
    const interceptor = new AuditInterceptor(
      { writeLog } as unknown as AuditRepository,
      { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector,
    );

    await expect(
      lastValueFrom(
        interceptor.intercept(httpContext() as never, {
          handle: () => throwError(() => new ConcurrencyError('IDEMPOTENCY_CONFLICT', 'conflict')),
        }),
      ),
    ).rejects.toThrow('conflict');

    expect(writeLog).toHaveBeenCalledOnce();
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failed',
        httpStatus: 409,
        errorCode: 'IDEMPOTENCY_CONFLICT',
        remark: 'HTTP 409',
      }),
    );
  });

  it('records a concurrent modification as HTTP 409 with its stable error code in the failure audit', async () => {
    const writeLog = vi.fn().mockResolvedValue(undefined);
    const interceptor = new AuditInterceptor(
      { writeLog } as unknown as AuditRepository,
      { getAllAndOverride: vi.fn().mockReturnValue(false) } as unknown as Reflector,
    );

    await expect(
      lastValueFrom(
        interceptor.intercept(httpContext() as never, {
          handle: () => throwError(() => new ConcurrencyError('CONCURRENT_MODIFICATION', 'stale')),
        }),
      ),
    ).rejects.toThrow('stale');

    expect(writeLog).toHaveBeenCalledOnce();
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failed',
        httpStatus: 409,
        errorCode: 'CONCURRENT_MODIFICATION',
        remark: 'HTTP 409',
      }),
    );
  });

  it('maps ConcurrencyError failures to HTTP 409 remarks and stable error codes', () => {
    expect(auditFailureRemark(new ConcurrencyError('IDEMPOTENCY_CONFLICT', 'conflict'))).toBe(
      'HTTP 409',
    );
    expect(auditErrorCode(new ConcurrencyError('CONCURRENT_MODIFICATION', 'stale'))).toBe(
      'CONCURRENT_MODIFICATION',
    );
  });

  it('maps idempotency storage failures to distinct stable codes and remarks', () => {
    expect(idempotencyStorageStatus(new IdempotencyStorageError('retryable', 'x'))).toBe(503);
    expect(idempotencyStorageStatus(new IdempotencyStorageError('corrupt', 'x'))).toBe(500);
    expect(
      auditFailureRemark(new IdempotencyStorageError('retryable', '幂等登记竞态，请重试')),
    ).toBe('HTTP 503');
    expect(
      auditFailureRemark(new IdempotencyStorageError('corrupt', '已保存的幂等结果无法反序列化')),
    ).toBe('HTTP 500');
    expect(auditErrorCode(new IdempotencyStorageError('retryable', 'x'))).toBe(
      'IDEMPOTENCY_STORAGE_RETRYABLE',
    );
    expect(auditErrorCode(new IdempotencyStorageError('corrupt', 'x'))).toBe(
      'IDEMPOTENCY_RESULT_CORRUPT',
    );
  });
});

const httpContext = () => ({
  switchToHttp: () => ({
    getRequest: () => ({
      method: 'POST',
      path: '/api/system/users',
      ip: '127.0.0.1',
      user: { id: '1' },
      requestId: 'request_1234',
    }),
    getResponse: () => ({ statusCode: 201 }),
  }),
  getHandler: () => undefined,
  getClass: () => undefined,
});
