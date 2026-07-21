import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AuditRepository } from '../../../application/ports/audit.repository.js';
import { AuditInterceptor, auditFailureRemark } from '../audit.interceptor.js';

describe('audit failure remarks', () => {
  it('does not persist raw exception messages', () => {
    expect(auditFailureRemark(new Error('SELECT password_hash FROM users'))).toBe(
      'Unhandled request failure',
    );
  });

  it('retains the safe status of expected HTTP errors', () => {
    expect(auditFailureRemark(new BadRequestException('password=secret'))).toBe('HTTP 400');
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
});

const httpContext = () => ({
  switchToHttp: () => ({
    getRequest: () => ({
      method: 'POST',
      path: '/api/system/users',
      ip: '127.0.0.1',
      user: { id: '1' },
    }),
  }),
  getHandler: () => undefined,
  getClass: () => undefined,
});
